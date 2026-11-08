//! Transport-agnostic command layer; see AGENTS.md for wire conventions.

pub mod dispatch;
pub mod error;
pub mod state;

mod app_info;
mod greet;

pub use app_info::{app_info, InfoArgs, InfoOut};
pub use dispatch::dispatch;
pub use error::{AppError, AppResult};
pub use greet::{greet, reset, GreetArgs, GreetOut, HistoryOut, ResetArgs};
pub use state::{Ctx, GreetRecord};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const GIT_HASH: &str = env!("KHALA_GIT_HASH");
