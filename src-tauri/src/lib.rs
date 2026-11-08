use khala_core::state::Ctx;
use khala_core::{AppResult, GreetArgs, GreetOut, HistoryOut, InfoArgs, InfoOut, ResetArgs};

#[tauri::command]
async fn greet(state: tauri::State<'_, Ctx>, args: GreetArgs) -> AppResult<GreetOut> {
    khala_core::greet(&state, args)
}

#[tauri::command]
async fn reset(state: tauri::State<'_, Ctx>, args: ResetArgs) -> AppResult<HistoryOut> {
    khala_core::reset(&state, args)
}

#[tauri::command]
async fn info(state: tauri::State<'_, Ctx>, args: InfoArgs) -> AppResult<InfoOut> {
    khala_core::app_info(&state, args)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Ctx::default())
        .invoke_handler(tauri::generate_handler![greet, reset, info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
