fn main() {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    if arguments
        .first()
        .is_some_and(|value| value == "--mvp-smoke")
    {
        code_desktop_lib::run_mvp_smoke(&arguments[1..]);
    } else {
        code_desktop_lib::run();
    }
}
