use std::{
    env, fs, io,
    path::{Path, PathBuf},
    process::Command,
};

const COMMIT_ENV: &str = "CODE_DESKTOP_BUILD_GIT_COMMIT";
const DIRTY_ENV: &str = "CODE_DESKTOP_BUILD_GIT_DIRTY";
const GENERATED_FILE: &str = "code_desktop_build_metadata.rs";

#[derive(Clone, Debug, Eq, PartialEq)]
struct GitMetadata {
    commit: String,
    dirty: bool,
    overridden: bool,
}

pub(crate) fn emit() -> Result<(), String> {
    println!("cargo:rerun-if-env-changed={COMMIT_ENV}");
    println!("cargo:rerun-if-env-changed={DIRTY_ENV}");

    let manifest_dir = PathBuf::from(
        env::var_os("CARGO_MANIFEST_DIR")
            .ok_or_else(|| "CARGO_MANIFEST_DIR is unavailable".to_string())?,
    );
    println!(
        "cargo:rerun-if-changed={}",
        manifest_dir.join("build.rs").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        manifest_dir.join("build_provenance.rs").display()
    );

    let override_commit = env::var(COMMIT_ENV).ok();
    let override_dirty = env::var(DIRTY_ENV).ok();
    let metadata = metadata_from_override(
        override_commit.as_deref(),
        override_dirty.as_deref(),
    )?
    .unwrap_or_else(|| {
        read_git_metadata(&manifest_dir).unwrap_or_else(|error| {
            panic!(
                "failed to read Git provenance: {}. Set both {} and {} for a source build without Git metadata",
                error, COMMIT_ENV, DIRTY_ENV
            )
        })
    });

    if override_commit.is_none() {
        emit_git_rerun_paths(&manifest_dir)?;
    }

    let out_dir =
        PathBuf::from(env::var_os("OUT_DIR").ok_or_else(|| "OUT_DIR is unavailable".to_string())?);
    write_if_changed(
        &out_dir.join(GENERATED_FILE),
        render_generated_source(&metadata).as_bytes(),
    )
    .map_err(|error| format!("failed to write generated provenance: {error}"))?;

    println!("cargo:rustc-env={COMMIT_ENV}={}", metadata.commit);
    println!(
        "cargo:rustc-env={DIRTY_ENV}={}",
        if metadata.dirty { "true" } else { "false" }
    );
    Ok(())
}

fn metadata_from_override(
    commit: Option<&str>,
    dirty: Option<&str>,
) -> Result<Option<GitMetadata>, String> {
    match (commit, dirty) {
        (None, None) => Ok(None),
        (Some(commit), Some(dirty)) => Ok(Some(GitMetadata {
            commit: normalize_commit(commit)?,
            dirty: parse_dirty(dirty)?,
            overridden: true,
        })),
        _ => Err(format!("{COMMIT_ENV} and {DIRTY_ENV} must be set together")),
    }
}

fn read_git_metadata(manifest_dir: &Path) -> Result<GitMetadata, String> {
    let repository = PathBuf::from(git_text(manifest_dir, &["rev-parse", "--show-toplevel"])?);
    let commit = normalize_commit(&git_text(&repository, &["rev-parse", "--verify", "HEAD"])?)?;
    let status = git_bytes(
        &repository,
        &[
            "status",
            "--porcelain=v1",
            "--untracked-files=normal",
            "--ignore-submodules=none",
        ],
    )?;
    Ok(GitMetadata {
        commit,
        dirty: !status.is_empty(),
        overridden: false,
    })
}

fn emit_git_rerun_paths(manifest_dir: &Path) -> Result<(), String> {
    let repository = PathBuf::from(git_text(manifest_dir, &["rev-parse", "--show-toplevel"])?);
    let git_dir = resolve_git_path(
        &repository,
        &git_text(&repository, &["rev-parse", "--git-dir"])?,
    );
    let common_dir = resolve_git_path(
        &repository,
        &git_text(&repository, &["rev-parse", "--git-common-dir"])?,
    );

    for path in [
        git_dir.join("HEAD"),
        git_dir.join("index"),
        common_dir.join("packed-refs"),
        common_dir.join("refs"),
    ] {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    if let Ok(reference) = git_text(&repository, &["symbolic-ref", "-q", "HEAD"]) {
        println!(
            "cargo:rerun-if-changed={}",
            common_dir.join(reference).display()
        );
    }

    let files = git_bytes(
        &repository,
        &[
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
        ],
    )?;
    for relative in files
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
    {
        let Ok(relative) = std::str::from_utf8(relative) else {
            continue;
        };
        if relative.contains(['\r', '\n']) {
            continue;
        }
        println!(
            "cargo:rerun-if-changed={}",
            repository.join(relative).display()
        );
    }
    Ok(())
}

fn resolve_git_path(repository: &Path, value: &str) -> PathBuf {
    let path = PathBuf::from(value);
    if path.is_absolute() {
        path
    } else {
        repository.join(path)
    }
}

fn normalize_commit(value: &str) -> Result<String, String> {
    let value = value.trim();
    if !matches!(value.len(), 40 | 64) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(format!(
            "{COMMIT_ENV} must be a full 40- or 64-character Git object ID"
        ));
    }
    Ok(value.to_ascii_lowercase())
}

fn parse_dirty(value: &str) -> Result<bool, String> {
    match value.trim() {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => Err(format!("{DIRTY_ENV} must be exactly `true` or `false`")),
    }
}

fn render_generated_source(metadata: &GitMetadata) -> String {
    format!(
        r#"// @generated by build.rs; do not edit.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BuildProvenance {{
    pub git_commit: &'static str,
    pub git_dirty: bool,
    pub git_overridden: bool,
}}

pub const GIT_COMMIT: &str = "{}";
pub const GIT_DIRTY: bool = {};
pub const GIT_OVERRIDDEN: bool = {};
pub const GIT_STATE: &str = "{}";
pub const BUILD_PROVENANCE: BuildProvenance = BuildProvenance {{
    git_commit: GIT_COMMIT,
    git_dirty: GIT_DIRTY,
    git_overridden: GIT_OVERRIDDEN,
}};
"#,
        metadata.commit,
        metadata.dirty,
        metadata.overridden,
        if metadata.dirty { "dirty" } else { "clean" }
    )
}

fn write_if_changed(path: &Path, contents: &[u8]) -> io::Result<()> {
    if fs::read(path).is_ok_and(|existing| existing == contents) {
        return Ok(());
    }
    fs::write(path, contents)
}

fn git_text(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let bytes = git_bytes(cwd, args)?;
    String::from_utf8(bytes)
        .map(|value| value.trim().to_string())
        .map_err(|_| format!("`git {}` returned non-UTF-8 output", args.join(" ")))
}

fn git_bytes(cwd: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|error| format!("could not run Git: {error}"))?;
    if output.status.success() {
        return Ok(output.stdout);
    }
    let detail = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "`git {}` failed: {}",
        args.join(" "),
        detail.trim()
    ))
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    const SHA1: &str = "73bd9686129b0cd74f1f8941d3bbbcabe685280f";

    struct TemporaryRepository(PathBuf);

    impl TemporaryRepository {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = env::temp_dir().join(format!(
                "code-build-provenance-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            git_text(&path, &["init", "--quiet"]).unwrap();
            git_text(&path, &["config", "user.name", "Code Test"]).unwrap();
            git_text(
                &path,
                &["config", "user.email", "code-test@example.invalid"],
            )
            .unwrap();
            git_text(&path, &["config", "commit.gpgsign", "false"]).unwrap();
            fs::write(path.join("tracked.txt"), "clean\n").unwrap();
            git_text(&path, &["add", "tracked.txt"]).unwrap();
            git_text(&path, &["commit", "--quiet", "-m", "fixture"]).unwrap();
            Self(path)
        }
    }

    impl Drop for TemporaryRepository {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn explicit_metadata_requires_a_complete_valid_pair() {
        assert_eq!(
            metadata_from_override(Some(SHA1), Some("true")).unwrap(),
            Some(GitMetadata {
                commit: SHA1.to_string(),
                dirty: true,
                overridden: true,
            })
        );
        assert!(metadata_from_override(Some(SHA1), None).is_err());
        assert!(metadata_from_override(Some("short"), Some("false")).is_err());
        assert!(metadata_from_override(Some(SHA1), Some("1")).is_err());
    }

    #[test]
    fn generated_source_contains_only_stable_provenance() {
        let source = render_generated_source(&GitMetadata {
            commit: SHA1.to_string(),
            dirty: false,
            overridden: false,
        });

        assert!(source.contains(&format!("pub const GIT_COMMIT: &str = \"{SHA1}\";")));
        assert!(source.contains("pub const GIT_DIRTY: bool = false;"));
        assert!(source.contains("pub const GIT_OVERRIDDEN: bool = false;"));
        assert!(source.contains("pub const GIT_STATE: &str = \"clean\";"));
        assert!(!source.contains("timestamp"));
        assert!(!source.contains("CARGO_MANIFEST_DIR"));
    }

    #[test]
    fn sha256_repository_object_ids_are_supported() {
        let commit = "ABCDEF0123456789".repeat(4);
        assert_eq!(
            normalize_commit(&commit).unwrap(),
            commit.to_ascii_lowercase()
        );
    }

    #[test]
    fn git_metadata_tracks_exact_head_and_dirty_state() {
        let repository = TemporaryRepository::new();
        let expected_commit = git_text(&repository.0, &["rev-parse", "--verify", "HEAD"]).unwrap();

        assert_eq!(
            read_git_metadata(&repository.0).unwrap(),
            GitMetadata {
                commit: expected_commit,
                dirty: false,
                overridden: false,
            }
        );

        fs::write(repository.0.join("tracked.txt"), "dirty\n").unwrap();
        assert!(read_git_metadata(&repository.0).unwrap().dirty);
    }
}
