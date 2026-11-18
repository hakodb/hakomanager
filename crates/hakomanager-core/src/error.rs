//! Error classification shared by command handlers and the frontend.

use crate::dto::ErrorKind;

#[derive(Debug, thiserror::Error)]
pub enum ManagerError {
    #[error("{0}")]
    Unique(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    Generic(String),
}

impl ManagerError {
    pub fn kind(&self) -> ErrorKind {
        match self {
            Self::Unique(_) => ErrorKind::Unique,
            Self::Conflict(_) => ErrorKind::Conflict,
            Self::Validation(_) => ErrorKind::Validation,
            Self::Generic(_) => ErrorKind::Generic,
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::Unique(m) | Self::Conflict(m) | Self::Validation(m) | Self::Generic(m) => m,
        }
    }

    /// Classify an engine error from its message. Used until typed error
    /// variants are available from the engine crate across all code paths.
    pub fn classify(message: impl Into<String>) -> Self {
        let message = message.into();
        let lower = message.to_lowercase();
        if lower.contains("unique") || lower.contains("duplicate") {
            Self::Unique(message)
        } else if lower.contains("conflict")
            || lower.contains("backfill")
            || lower.contains("retry")
            || lower.contains("busy")
            || lower.contains("locked")
        {
            Self::Conflict(message)
        } else if lower.contains("not found")
            || lower.contains("missing")
            || lower.contains("invalid")
            || lower.contains("expected")
        {
            Self::Validation(message)
        } else {
            Self::Generic(message)
        }
    }
}

impl From<String> for ManagerError {
    fn from(value: String) -> Self {
        Self::classify(value)
    }
}

impl From<&str> for ManagerError {
    fn from(value: &str) -> Self {
        Self::classify(value.to_string())
    }
}

impl From<std::io::Error> for ManagerError {
    fn from(value: std::io::Error) -> Self {
        Self::Generic(value.to_string())
    }
}

impl From<serde_json::Error> for ManagerError {
    fn from(value: serde_json::Error) -> Self {
        Self::Validation(value.to_string())
    }
}

pub type Result<T> = std::result::Result<T, ManagerError>;
