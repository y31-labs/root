use std::{future::Future, path::PathBuf, pin::Pin};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use super::{codex_request, codex_respond, AppState};

pub(crate) type EngineFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'a>>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum EngineTurnStatus {
    Running,
    Completed,
    Failed,
    Interrupted,
}

pub(crate) trait ImplementationEngine: Send + Sync {
    fn start_thread(&self, cwd: PathBuf, tools: Vec<Value>) -> EngineFuture<'_, String>;
    fn resume_thread(&self, thread_id: String, cwd: PathBuf) -> EngineFuture<'_, ()>;
    fn start_turn(
        &self,
        thread_id: String,
        cwd: PathBuf,
        prompt: String,
    ) -> EngineFuture<'_, String>;
    fn turn_status(&self, thread_id: String, turn_id: String)
        -> EngineFuture<'_, EngineTurnStatus>;
    fn interrupt(&self, thread_id: String, turn_id: Option<String>) -> EngineFuture<'_, ()>;
    fn dynamic_tool_call(&self, message: Value) -> EngineFuture<'_, Value>;
    fn approval_response(&self, request_id: Value, result: Value) -> EngineFuture<'_, ()>;
}

pub(crate) struct CodexImplementationEngine {
    app: AppHandle,
}

impl CodexImplementationEngine {
    pub(crate) fn new(app: AppHandle) -> Self {
        Self { app }
    }

    async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let state = self.app.state::<AppState>();
        codex_request(&self.app, &state, method, params).await
    }
}

impl ImplementationEngine for CodexImplementationEngine {
    fn start_thread(&self, cwd: PathBuf, tools: Vec<Value>) -> EngineFuture<'_, String> {
        Box::pin(async move {
            let response = self
                .request(
                    "thread/start",
                    json!({
                        "cwd": cwd,
                        "runtimeWorkspaceRoots": [cwd],
                        "approvalPolicy": "on-request",
                        "approvalsReviewer": "user",
                        "sandbox": "workspace-write",
                        "serviceName": "code-desktop",
                        "threadSource": "user",
                        "dynamicTools": tools
                    }),
                )
                .await?;
            response
                .pointer("/thread/id")
                .and_then(Value::as_str)
                .map(str::to_string)
                .ok_or_else(|| "Codex did not return a thread id".to_string())
        })
    }

    fn resume_thread(&self, thread_id: String, cwd: PathBuf) -> EngineFuture<'_, ()> {
        Box::pin(async move {
            let response = self
                .request(
                    "thread/resume",
                    json!({
                        "threadId": thread_id,
                        "cwd": cwd,
                        "approvalPolicy": "on-request",
                        "approvalsReviewer": "user",
                        "sandbox": "workspace-write"
                    }),
                )
                .await?;
            match response.pointer("/thread/id").and_then(Value::as_str) {
                Some(resumed) if resumed == thread_id => Ok(()),
                Some(resumed) => Err(format!(
                    "Codex resumed thread `{resumed}` instead of `{thread_id}`"
                )),
                None => Err("Codex did not return the resumed thread id".to_string()),
            }
        })
    }

    fn start_turn(
        &self,
        thread_id: String,
        cwd: PathBuf,
        prompt: String,
    ) -> EngineFuture<'_, String> {
        Box::pin(async move {
            let response = self
                .request(
                    "turn/start",
                    json!({
                        "threadId": thread_id,
                        "input": [{
                            "type": "text",
                            "text": prompt,
                            "text_elements": []
                        }],
                        "cwd": cwd,
                        "runtimeWorkspaceRoots": [cwd],
                        "approvalPolicy": "on-request",
                        "approvalsReviewer": "user"
                    }),
                )
                .await?;
            response
                .pointer("/turn/id")
                .and_then(Value::as_str)
                .map(str::to_string)
                .ok_or_else(|| "Codex did not return a turn id".to_string())
        })
    }

    fn turn_status(
        &self,
        thread_id: String,
        turn_id: String,
    ) -> EngineFuture<'_, EngineTurnStatus> {
        Box::pin(async move {
            let response = match self
                .request(
                    "thread/read",
                    json!({ "threadId": thread_id, "includeTurns": true }),
                )
                .await
            {
                Ok(response) => response,
                Err(error) if transient_thread_read_error(&error) => {
                    return Ok(EngineTurnStatus::Running)
                }
                Err(error) => return Err(error),
            };
            let status = response
                .pointer("/thread/turns")
                .and_then(Value::as_array)
                .and_then(|turns| {
                    turns
                        .iter()
                        .find(|turn| turn.get("id").and_then(Value::as_str) == Some(&turn_id))
                })
                .and_then(|turn| turn.get("status"))
                .and_then(Value::as_str);
            let Some(status) = status else {
                return Ok(EngineTurnStatus::Running);
            };
            match status {
                "inProgress" | "running" => Ok(EngineTurnStatus::Running),
                "completed" => Ok(EngineTurnStatus::Completed),
                "failed" => Ok(EngineTurnStatus::Failed),
                "interrupted" => Ok(EngineTurnStatus::Interrupted),
                value => Err(format!("Codex returned unsupported turn status `{value}`")),
            }
        })
    }

    fn interrupt(&self, thread_id: String, turn_id: Option<String>) -> EngineFuture<'_, ()> {
        Box::pin(async move {
            let turn_id = match turn_id {
                Some(turn_id) => turn_id,
                None => {
                    let response = self
                        .request(
                            "thread/read",
                            json!({ "threadId": thread_id, "includeTurns": true }),
                        )
                        .await?;
                    response
                        .pointer("/thread/turns")
                        .and_then(Value::as_array)
                        .and_then(|turns| turns.last())
                        .and_then(|turn| turn.get("id"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .ok_or_else(|| "Codex thread has no interruptible turn".to_string())?
                }
            };
            self.request(
                "turn/interrupt",
                json!({ "threadId": thread_id, "turnId": turn_id }),
            )
            .await?;
            Ok(())
        })
    }

    fn dynamic_tool_call(&self, message: Value) -> EngineFuture<'_, Value> {
        Box::pin(
            async move { super::local_sessions::handle_dynamic_tool(&self.app, &message).await },
        )
    }

    fn approval_response(&self, request_id: Value, result: Value) -> EngineFuture<'_, ()> {
        Box::pin(async move {
            let state = self.app.state::<AppState>();
            codex_respond(&self.app, &state, request_id, result).await
        })
    }
}

fn transient_thread_read_error(error: &str) -> bool {
    let error = error.to_ascii_lowercase();
    error.contains("rollout") && error.contains("empty")
        || error.contains("not materialized")
        || error.contains("no rollout found")
}

#[cfg(test)]
pub(crate) mod test_support {
    use std::{
        collections::VecDeque,
        fs,
        path::PathBuf,
        sync::{Arc, Mutex},
    };

    use serde_json::Value;

    use super::{EngineFuture, EngineTurnStatus, ImplementationEngine};

    #[derive(Clone, Debug, PartialEq)]
    pub(crate) enum EngineRequest {
        StartThread {
            cwd: PathBuf,
            tools: Vec<Value>,
        },
        ResumeThread {
            thread_id: String,
            cwd: PathBuf,
        },
        StartTurn {
            thread_id: String,
            cwd: PathBuf,
            prompt: String,
        },
        TurnStatus {
            thread_id: String,
            turn_id: String,
        },
        Interrupt {
            thread_id: String,
            turn_id: Option<String>,
        },
        DynamicTool(Value),
        Approval {
            request_id: Value,
            result: Value,
        },
    }

    #[derive(Clone, Debug)]
    pub(crate) struct FileEdit {
        pub(crate) path: PathBuf,
        pub(crate) contents: Vec<u8>,
    }

    #[allow(dead_code)]
    #[derive(Clone, Debug)]
    pub(crate) enum EngineStep {
        StartThread {
            thread_id: String,
        },
        ResumeThread {
            thread_id: String,
        },
        StartTurn {
            thread_id: String,
            turn_id: String,
            edits: Vec<FileEdit>,
        },
        TurnStatus {
            thread_id: String,
            turn_id: String,
            status: EngineTurnStatus,
        },
        Interrupt {
            thread_id: String,
            turn_id: Option<String>,
        },
        DynamicTool {
            result: Value,
        },
        Approval,
        Failure(String),
        Malformed(String),
    }

    #[derive(Default)]
    struct FakeState {
        steps: VecDeque<EngineStep>,
        requests: Vec<EngineRequest>,
    }

    #[derive(Clone, Default)]
    pub(crate) struct FakeImplementationEngine {
        state: Arc<Mutex<FakeState>>,
    }

    impl FakeImplementationEngine {
        pub(crate) fn scripted(steps: Vec<EngineStep>) -> Self {
            Self {
                state: Arc::new(Mutex::new(FakeState {
                    steps: steps.into(),
                    requests: Vec::new(),
                })),
            }
        }

        pub(crate) fn requests(&self) -> Vec<EngineRequest> {
            self.state.lock().unwrap().requests.clone()
        }

        pub(crate) fn assert_exhausted(&self) {
            let state = self.state.lock().unwrap();
            assert!(
                state.steps.is_empty(),
                "unconsumed engine steps: {:?}",
                state.steps
            );
        }

        fn take_step(&self, request: EngineRequest) -> Result<EngineStep, String> {
            let mut state = self.state.lock().map_err(|error| error.to_string())?;
            state.requests.push(request);
            match state.steps.pop_front() {
                Some(EngineStep::Failure(error)) => Err(error),
                Some(EngineStep::Malformed(message)) => {
                    Err(format!("Unexpected protocol message: {message}"))
                }
                Some(step) => Ok(step),
                None => Err("Unexpected engine request after script completion".to_string()),
            }
        }
    }

    impl ImplementationEngine for FakeImplementationEngine {
        fn start_thread(&self, cwd: PathBuf, tools: Vec<Value>) -> EngineFuture<'_, String> {
            let result = match self.take_step(EngineRequest::StartThread { cwd, tools }) {
                Ok(EngineStep::StartThread { thread_id }) => Ok(thread_id),
                Ok(step) => Err(format!("Expected start-thread step, received {step:?}")),
                Err(error) => Err(error),
            };
            Box::pin(async move { result })
        }

        fn resume_thread(&self, thread_id: String, cwd: PathBuf) -> EngineFuture<'_, ()> {
            let result = match self.take_step(EngineRequest::ResumeThread {
                thread_id: thread_id.clone(),
                cwd,
            }) {
                Ok(EngineStep::ResumeThread {
                    thread_id: expected,
                }) if expected == thread_id => Ok(()),
                Ok(step) => Err(format!("Expected resume-thread step, received {step:?}")),
                Err(error) => Err(error),
            };
            Box::pin(async move { result })
        }

        fn start_turn(
            &self,
            thread_id: String,
            cwd: PathBuf,
            prompt: String,
        ) -> EngineFuture<'_, String> {
            let result = match self.take_step(EngineRequest::StartTurn {
                thread_id: thread_id.clone(),
                cwd: cwd.clone(),
                prompt,
            }) {
                Ok(EngineStep::StartTurn {
                    thread_id: expected,
                    turn_id,
                    edits,
                }) if expected == thread_id => {
                    let edit_result = edits.into_iter().try_for_each(|edit| {
                        let path = cwd.join(edit.path);
                        if let Some(parent) = path.parent() {
                            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                        }
                        fs::write(path, edit.contents).map_err(|error| error.to_string())
                    });
                    edit_result.map(|()| turn_id)
                }
                Ok(step) => Err(format!("Expected start-turn step, received {step:?}")),
                Err(error) => Err(error),
            };
            Box::pin(async move { result })
        }

        fn turn_status(
            &self,
            thread_id: String,
            turn_id: String,
        ) -> EngineFuture<'_, EngineTurnStatus> {
            let result = match self.take_step(EngineRequest::TurnStatus {
                thread_id: thread_id.clone(),
                turn_id: turn_id.clone(),
            }) {
                Ok(EngineStep::TurnStatus {
                    thread_id: expected_thread,
                    turn_id: expected_turn,
                    status,
                }) if expected_thread == thread_id && expected_turn == turn_id => Ok(status),
                Ok(step) => Err(format!("Expected turn-status step, received {step:?}")),
                Err(error) => Err(error),
            };
            Box::pin(async move { result })
        }

        fn interrupt(&self, thread_id: String, turn_id: Option<String>) -> EngineFuture<'_, ()> {
            let result = match self.take_step(EngineRequest::Interrupt {
                thread_id: thread_id.clone(),
                turn_id: turn_id.clone(),
            }) {
                Ok(EngineStep::Interrupt {
                    thread_id: expected_thread,
                    turn_id: expected_turn,
                }) if expected_thread == thread_id && expected_turn == turn_id => Ok(()),
                Ok(step) => Err(format!("Expected interrupt step, received {step:?}")),
                Err(error) => Err(error),
            };
            Box::pin(async move { result })
        }

        fn dynamic_tool_call(&self, message: Value) -> EngineFuture<'_, Value> {
            let result = match self.take_step(EngineRequest::DynamicTool(message)) {
                Ok(EngineStep::DynamicTool { result }) => Ok(result),
                Ok(step) => Err(format!("Expected dynamic-tool step, received {step:?}")),
                Err(error) => Err(error),
            };
            Box::pin(async move { result })
        }

        fn approval_response(&self, request_id: Value, result: Value) -> EngineFuture<'_, ()> {
            let response = match self.take_step(EngineRequest::Approval { request_id, result }) {
                Ok(EngineStep::Approval) => Ok(()),
                Ok(step) => Err(format!("Expected approval step, received {step:?}")),
                Err(error) => Err(error),
            };
            Box::pin(async move { response })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::transient_thread_read_error;

    #[test]
    fn only_materialization_races_are_transient_thread_reads() {
        assert!(transient_thread_read_error(
            "thread-store internal error: rollout at /tmp/thread.jsonl is empty"
        ));
        assert!(transient_thread_read_error(
            "thread is not materialized yet"
        ));
        assert!(transient_thread_read_error(
            "no rollout found for thread id 123"
        ));
        assert!(!transient_thread_read_error("authentication failed"));
        assert!(!transient_thread_read_error("thread not found"));
    }
}
