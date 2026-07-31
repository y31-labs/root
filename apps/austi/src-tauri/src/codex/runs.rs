use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use tokio::sync::broadcast;

use super::types::{CodexRunInfo, CodexStreamEvent, CodexTextResult};

#[derive(Clone)]
pub(super) enum CodexRunOutcome {
    Completed(CodexTextResult),
    Failed(String),
}

#[derive(Clone)]
pub(super) struct SequencedCodexEvent {
    pub(super) sequence: u64,
    pub(super) event: CodexStreamEvent,
}

pub(super) struct CodexRun {
    pub(super) info: CodexRunInfo,
    events: Mutex<Vec<SequencedCodexEvent>>,
    outcome: Mutex<Option<CodexRunOutcome>>,
    update_sender: broadcast::Sender<()>,
}

impl CodexRun {
    fn new(info: CodexRunInfo) -> Arc<Self> {
        let (update_sender, _) = broadcast::channel(256);
        Arc::new(Self {
            info,
            events: Mutex::new(Vec::new()),
            outcome: Mutex::new(None),
            update_sender,
        })
    }

    pub(super) fn record(&self, event: CodexStreamEvent) -> Result<(), String> {
        {
            let mut events = self.events.lock().map_err(display_error)?;
            let stored = SequencedCodexEvent {
                sequence: events.len() as u64,
                event,
            };
            events.push(stored);
        }
        let _ = self.update_sender.send(());
        Ok(())
    }

    pub(super) fn finish(&self, outcome: CodexRunOutcome) -> Result<(), String> {
        self.outcome.lock().map_err(display_error)?.replace(outcome);
        let _ = self.update_sender.send(());
        Ok(())
    }

    pub(super) fn subscribe(
        &self,
    ) -> Result<(Vec<SequencedCodexEvent>, broadcast::Receiver<()>), String> {
        let update_receiver = self.update_sender.subscribe();
        let events = self.events.lock().map_err(display_error)?.clone();
        Ok((events, update_receiver))
    }

    pub(super) fn events_after(
        &self,
        sequence: Option<u64>,
    ) -> Result<Vec<SequencedCodexEvent>, String> {
        let events = self.events.lock().map_err(display_error)?;
        Ok(events
            .iter()
            .filter(|event| sequence.is_none_or(|sequence| event.sequence > sequence))
            .cloned()
            .collect())
    }

    pub(super) fn is_active(&self) -> bool {
        self.outcome
            .lock()
            .map(|outcome| outcome.is_none())
            .unwrap_or(true)
    }

    pub(super) fn outcome(&self) -> Result<Option<CodexRunOutcome>, String> {
        Ok(self.outcome.lock().map_err(display_error)?.clone())
    }
}

#[derive(Default)]
pub(crate) struct CodexRuns {
    active: Mutex<HashSet<String>>,
    chat_runs: Mutex<HashMap<String, String>>,
    runs: Mutex<HashMap<String, Arc<CodexRun>>>,
}

impl CodexRuns {
    pub(super) fn insert(&self, info: CodexRunInfo) -> Result<Arc<CodexRun>, String> {
        let mut active = self.active.lock().map_err(display_error)?;
        let mut chat_runs = self.chat_runs.lock().map_err(display_error)?;
        let mut runs = self.runs.lock().map_err(display_error)?;
        if let Some(previous_run_id) = chat_runs.get(&info.chat_id) {
            if active.contains(previous_run_id) {
                return Err("This chat already has a running Codex turn.".to_string());
            }
            runs.remove(previous_run_id);
        }

        let run = CodexRun::new(info.clone());
        active.insert(info.run_id.clone());
        chat_runs.insert(info.chat_id.clone(), info.run_id.clone());
        runs.insert(info.run_id.clone(), run.clone());
        Ok(run)
    }

    pub(super) fn get(&self, run_id: &str) -> Result<Option<Arc<CodexRun>>, String> {
        Ok(self
            .runs
            .lock()
            .map_err(display_error)?
            .get(run_id)
            .cloned())
    }

    pub(super) fn get_for_chat(&self, chat_id: &str) -> Result<Option<Arc<CodexRun>>, String> {
        let run_id = self
            .chat_runs
            .lock()
            .map_err(display_error)?
            .get(chat_id)
            .cloned();
        let Some(run_id) = run_id else {
            return Ok(None);
        };
        self.get(&run_id)
    }

    pub(super) fn finish(&self, run_id: &str) -> Result<(), String> {
        self.active.lock().map_err(display_error)?.remove(run_id);
        Ok(())
    }

    pub(crate) fn has_active(&self) -> bool {
        self.active
            .lock()
            .map(|active| !active.is_empty())
            .unwrap_or(true)
    }

    pub(super) fn active_runs(&self) -> Result<Vec<CodexRunInfo>, String> {
        let active = self.active.lock().map_err(display_error)?;
        let runs = self.runs.lock().map_err(display_error)?;
        Ok(active
            .iter()
            .filter_map(|run_id| runs.get(run_id).map(|run| run.info.clone()))
            .collect())
    }
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn info(run_id: &str, chat_id: &str) -> CodexRunInfo {
        CodexRunInfo {
            run_id: run_id.to_string(),
            chat_id: chat_id.to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            assistant_message_id: "message-2".to_string(),
            model: None,
        }
    }

    #[test]
    fn retains_completed_runs_for_late_chat_subscribers() {
        let runs = CodexRuns::default();
        let run = runs.insert(info("run-1", "chat-1")).unwrap();
        run.record(CodexStreamEvent::Completed).unwrap();
        run.finish(CodexRunOutcome::Completed(CodexTextResult {
            thread_id: "thread-1".to_string(),
        }))
        .unwrap();
        runs.finish("run-1").unwrap();

        let restored = runs.get_for_chat("chat-1").unwrap().unwrap();
        assert!(!restored.is_active());
        assert_eq!(restored.subscribe().unwrap().0.len(), 1);
        assert!(!runs.has_active());
    }

    #[test]
    fn allows_parallel_runs_in_different_chats() {
        let runs = CodexRuns::default();
        runs.insert(info("run-1", "chat-1")).unwrap();
        runs.insert(info("run-2", "chat-2")).unwrap();

        assert!(runs.has_active());
        assert_eq!(
            runs.insert(info("run-3", "chat-1")).err().unwrap(),
            "This chat already has a running Codex turn."
        );
    }

    #[test]
    fn returns_only_active_runs_for_update_shutdown() {
        let runs = CodexRuns::default();
        let completed = runs.insert(info("run-1", "chat-1")).unwrap();
        completed
            .finish(CodexRunOutcome::Completed(CodexTextResult {
                thread_id: "thread-1".to_string(),
            }))
            .unwrap();
        runs.finish("run-1").unwrap();
        runs.insert(info("run-2", "chat-2")).unwrap();

        let active = runs.active_runs().unwrap();

        assert_eq!(active.len(), 1);
        assert_eq!(active[0].run_id, "run-2");
    }
}
