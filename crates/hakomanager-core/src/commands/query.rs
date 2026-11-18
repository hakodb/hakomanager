use super::{arg_str, arg_str_or, engine};
use crate::dto::QuerySpec;
use crate::error::{ManagerError, Result};
use crate::state::ManagerState;
use serde_json::{json, Value};

pub fn run(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let spec = query_spec(args)?;
    let documents = engine.run_query(&spec)?;
    serde_json::to_value(documents).map_err(ManagerError::from)
}

pub fn explain(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let spec = query_spec(args)?;
    engine.explain(&spec)
}

pub fn aggregate(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let spec = query_spec(args)?;
    let operation = arg_str_or(args, "aggregate", "count")?;
    let field = args.get("field").and_then(Value::as_str);
    engine.aggregate(&spec, operation, field)
}

fn query_spec(args: &Value) -> Result<QuerySpec> {
    let source = args.get("spec").unwrap_or(args);
    if source.get("collection").is_none() {
        arg_str(args, "collection")?;
    }
    serde_json::from_value(source.clone()).map_err(ManagerError::from)
}

/// Commands that take bare (space-separated) arguments instead of a
/// fluent chain. The rest of the line is passed through verbatim.
const BARE_COMMANDS: &[&str] = &[
    "collections", "stats", "docs", "get", "put", "del", "indexes",
    "ops", "schema", "audit", "versions", "compact", "vacuum", "flush",
    "backup", "search",
];

/// Query console: one text box for both fluent queries and manager ops.
///
/// Bare commands:
///   collections | stats <col> | docs <col> [limit] | get <col> <id>
///   put <col> <id> <json> | del <col> <id> [force] | indexes [col]
///   ops | schema <col> [set <json>] | audit | versions
///   compact [col] | vacuum <col> | flush | backup <path>
///   search <col> <field> <jsonVector> [k]
///
/// Fluent queries:
///   <collection>.where(field,op,value)[.or(...)...]
///     [.orderBy(field[:desc])...][.limit(n)][.offset(n)]
///     [.select(f1,f2)][.count()|.sum(f)|.avg(f)|.min(f)|.max(f)][.explain()]
/// `where(...; ...)` groups additional AND-filters; `or(...)` is the
/// engine's OR-group. Ops match the Query page (eq/gte/contains/...).
pub fn console(args: &Value, state: &ManagerState) -> Result<Value> {
    let input = arg_str(args, "input")?.trim();
    if input.is_empty() {
        return Err(ManagerError::Validation("empty command".into()));
    }
    let head = input.split([' ', '(', '.']).next().unwrap_or("");
    if BARE_COMMANDS.contains(&head) {
        bare_command(head, input, args, state)
    } else {
        run_fluent(input, args, state)
    }
}

fn bare_command(head: &str, input: &str, args: &Value, state: &ManagerState) -> Result<Value> {
    let rest = input[head.len()..].trim();
    let profile_id = arg_str(args, "profileId")?;
    let mut words = rest.split_whitespace();

    match head {
        "collections" => super::collection::list(&json!({ "profileId": profile_id }), state),
        "stats" => {
            let col = next_word(&mut words, "stats <collection>")?;
            super::collection::stats(&json!({ "profileId": profile_id, "collection": col }), state)
        }
        "docs" => {
            let col = next_word(&mut words, "docs <collection> [limit]")?;
            let limit = words.next().map(|w| {
                w.parse::<u64>().map_err(|_| {
                    ManagerError::Validation("docs limit must be a number".into())
                })
            });
            super::document::list(
                &json!({
                    "profileId": profile_id,
                    "collection": col,
                    "limit": limit.transpose()?.unwrap_or(50),
                }),
                state,
            )
        }
        "get" => {
            let (col, id) = two_words(&mut words, "get <collection> <id>")?;
            super::document::get(
                &json!({ "profileId": profile_id, "collection": col, "id": id }),
                state,
            )
        }
        "put" => {
            let (col, id) = two_words(&mut words, "put <collection> <id> <json>")?;
            let data = json_tail(&mut words, "put <collection> <id> <json>")?;
            super::document::put(
                &json!({ "profileId": profile_id, "collection": col, "id": id, "data": data }),
                state,
            )
        }
        "del" => {
            let (col, id) = two_words(&mut words, "del <collection> <id> [force]")?;
            let force = words.next() == Some("force");
            super::document::delete(
                &json!({ "profileId": profile_id, "collection": col, "id": id, "force": force }),
                state,
            )
        }
        "indexes" => {
            let collection = words.next();
            super::index::list(
                &json!({ "profileId": profile_id, "collection": collection }),
                state,
            )
        }
        "ops" | "info" => super::ops::stats(&json!({ "profileId": profile_id }), state),
        "schema" => {
            let col = next_word(&mut words, "schema <collection> [set <json>]")?;
            if words.next() == Some("set") {
                let schema = json_tail(&mut words, "schema <collection> set <json>")?;
                super::ops_v2::schema_set(
                    &json!({ "profileId": profile_id, "collection": col, "schema": schema }),
                    state,
                )
            } else {
                super::ops_v2::schema_list(&json!({ "profileId": profile_id }), state)
            }
        }
        "audit" => super::ops_v2::audit(&json!({ "profileId": profile_id }), state),
        "versions" => super::ops_v2::versions(&json!({ "profileId": profile_id }), state),
        "compact" => {
            let collection = words.next();
            super::ops::compact(
                &json!({ "profileId": profile_id, "collection": collection }),
                state,
            )
        }
        "vacuum" => {
            let col = next_word(&mut words, "vacuum <collection>")?;
            super::ops::vacuum(&json!({ "profileId": profile_id, "collection": col }), state)
        }
        "flush" => super::ops::flush(&json!({ "profileId": profile_id }), state),
        "backup" => {
            let path = next_word(&mut words, "backup <path>")?;
            super::ops::backup(&json!({ "profileId": profile_id, "path": path }), state)
        }
        "search" => {
            let (col, field) = two_words(
                &mut words,
                "search <collection> <field> <jsonVector> [k]",
            )?;
            let vector_text = words
                .clone()
                .collect::<Vec<_>>()
                .join(" ");
            if vector_text.is_empty() {
                return Err(ManagerError::Validation(
                    "usage: search <collection> <field> <jsonVector> [k]".into(),
                ));
            }
            let (vector, k) = split_vector_k(&vector_text)?;
            super::vector::search(
                &json!({
                    "profileId": profile_id,
                    "collection": col,
                    "field": field,
                    "vector": vector,
                    "k": k,
                }),
                state,
                true,
            )
        }
        other => Err(ManagerError::Validation(format!("unknown command '{other}'"))),
    }
}

fn next_word<'a>(
    words: &mut impl Iterator<Item = &'a str>,
    usage: &str,
) -> Result<&'a str> {
    words
        .next()
        .ok_or_else(|| ManagerError::Validation(format!("usage: {usage}")))
}

fn two_words<'a>(
    words: &mut impl Iterator<Item = &'a str>,
    usage: &str,
) -> Result<(String, String)> {
    let first = next_word(words, usage)?;
    let second = next_word(words, usage)?;
    Ok((first.to_string(), second.to_string()))
}

/// Everything left is one JSON value (spaces inside are preserved except
/// runs of 2+ collapse to one - fine for JSON unless a string value doubles
/// spaces). Trailing bare integer on vector literals becomes k.
fn json_tail<'a>(
    words: &mut impl Iterator<Item = &'a str>,
    usage: &str,
) -> Result<Value> {
    let text: &str = &words.collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return Err(ManagerError::Validation(format!("usage: {usage}")));
    }
    serde_json::from_str(text)
        .map_err(|e| ManagerError::Validation(format!("invalid JSON: {e}")))
}

fn split_vector_k(text: &str) -> Result<(Value, u64)> {
    if let Ok(vector) = serde_json::from_str::<Value>(text) {
        return Ok((vector, 10));
    }
    // Retry with the last whitespace token as k: [0.1,0.2] 5
    let Some((vector_text, k_text)) = text.rsplit_once(' ') else {
        return Err(ManagerError::Validation(
            "vector must be a JSON array of numbers".into(),
        ));
    };
    let k = k_text
        .trim()
        .parse::<u64>()
        .map_err(|_| ManagerError::Validation("vector must be a JSON array of numbers".into()))?;
    let vector = serde_json::from_str::<Value>(vector_text.trim())
        .map_err(|e| ManagerError::Validation(format!("invalid vector: {e}")))?;
    Ok((vector, k))
}

/// Fluent pipeline: collection.where(...).orderBy(...).limit(...)
fn run_fluent(input: &str, args: &Value, state: &ManagerState) -> Result<Value> {
    let segments = split_chain(input)?;
    let (head_name, head_args) = &segments[0];
    if head_args.is_some() {
        return Err(ManagerError::Validation(format!(
            "unexpected '({})' after collection '{}'",
            head_args.as_deref().unwrap_or_default(),
            head_name
        )));
    }
    let mut spec = QuerySpec {
        collection: head_name.clone(),
        ..QuerySpec::default()
    };
    let mut aggregate: Option<(String, Option<String>)> = None;
    let mut explain = false;

    for (name, raw_args) in &segments[1..] {
        let raw_args = raw_args.as_deref().unwrap_or("");
        match name.as_str() {
            "where" | "or" => {
                let filters = parse_filters(raw_args)?;
                if name == "or" {
                    spec.or_filters.extend(filters);
                } else {
                    spec.filters.extend(filters);
                }
            }
            "orderBy" => {
                for part in raw_args.split(',').map(str::trim).filter(|p| !p.is_empty()) {
                    let (field, ascending) = match part.split_once(':') {
                        Some((field, dir)) => (
                            field.trim().to_string(),
                            !dir.trim().eq_ignore_ascii_case("desc"),
                        ),
                        None => (part.to_string(), true),
                    };
                    spec.order_by.push(crate::dto::OrderSpec { field, ascending });
                }
            }
            "limit" => spec.limit = Some(parse_usize(raw_args, "limit")?),
            "offset" => spec.offset = Some(parse_usize(raw_args, "offset")?),
            "select" => {
                spec.select = raw_args
                    .split(',')
                    .map(str::trim)
                    .filter(|p| !p.is_empty())
                    .map(str::to_string)
                    .collect();
            }
            "count" | "sum" | "avg" | "min" | "max" => {
                let field = raw_args.trim();
                aggregate = Some((
                    name.clone(),
                    (!field.is_empty()).then(|| field.to_string()),
                ));
            }
            "explain" => explain = true,
            other => {
                return Err(ManagerError::Validation(format!(
                    "unknown pipeline step '{other}' (where/or/orderBy/limit/offset/select/count/sum/avg/min/max/explain)"
                )));
            }
        }
    }

    let engine = engine(args, state)?;
    if let Some((operation, field)) = aggregate {
        return engine.aggregate(&spec, &operation, field.as_deref());
    }
    if explain {
        return engine.explain(&spec);
    }
    let documents = engine.run_query(&spec)?;
    serde_json::to_value(documents).map_err(ManagerError::from)
}

/// Split a fluent chain on '.' at top level (quotes, parens and [] {} are
/// respected so `where(name,eq,"a.b")` and `[0.1,0.2]` survive). Each
/// segment is (ident, args-inside-parens-or-None).
fn split_chain(input: &str) -> Result<Vec<(String, Option<String>)>> {
    let mut segments: Vec<(String, Option<String>)> = Vec::new();
    let mut ident = String::new();
    let mut call: Option<String> = None;
    let mut depth = 0usize; // parens inside call args
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for ch in input.chars() {
        if call.is_some() {
            let args = call.as_mut().expect("call active");
            if quote.is_some() {
                if escaped {
                    escaped = false;
                } else if ch == '\\' {
                    escaped = true;
                } else if ch == quote.expect("quote active") {
                    quote = None;
                }
                args.push(ch);
                continue;
            }
            match ch {
                '"' | '\'' => {
                    quote = Some(ch);
                    args.push(ch);
                }
                '(' | '[' | '{' => {
                    depth += 1;
                    args.push(ch);
                }
                ')' | ']' | '}' => {
                    if depth == 0 {
                        let args = std::mem::take(&mut call).expect("call active");
                        segments.push((std::mem::take(&mut ident), Some(args)));
                    } else {
                        depth -= 1;
                        args.push(ch);
                    }
                }
                _ => args.push(ch),
            }
            continue;
        }
        match ch {
            c if c.is_alphanumeric() || c == '_' || c == '-' => ident.push(c),
            // A dot with an empty ident is legal right after a call closed
            // (the chain separator); only leading dots are errors.
            '.' if ident.is_empty() && segments.is_empty() => {
                return Err(ManagerError::Validation(format!("unexpected '.' in '{input}'")));
            }
            '.' => {
                if !ident.is_empty() {
                    segments.push((std::mem::take(&mut ident), None));
                }
            }
            '(' => {
                call = Some(String::new());
                depth = 0;
            }
            c if c.is_whitespace() => {}
            other => {
                return Err(ManagerError::Validation(format!(
                    "unexpected character '{other}' in command"
                )));
            }
        }
    }
    if call.is_some() || quote.is_some() || depth != 0 {
        return Err(ManagerError::Validation(
            "unbalanced quotes or parentheses in command".into(),
        ));
    }
    if !ident.is_empty() {
        segments.push((ident, None));
    }
    if segments.is_empty() {
        return Err(ManagerError::Validation("empty command".into()));
    }
    Ok(segments)
}

/// Parse `field,op,value` groups separated by ';': where(a,eq,1;b,gt,2).
fn parse_filters(raw: &str) -> Result<Vec<crate::dto::FilterSpec>> {
    raw.split(';')
        .map(str::trim)
        .filter(|group| !group.is_empty())
        .map(|group| {
            let parts: Vec<&str> = group.splitn(3, ',').map(str::trim).collect();
            if parts.len() < 2 {
                return Err(ManagerError::Validation(format!(
                    "filter must be (field,op[,value]): got '{group}'"
                )));
            }
            let value_raw = if parts.len() == 3 { parts[2] } else { "" };
            Ok(crate::dto::FilterSpec {
                field: parts[0].to_string(),
                op: parts[1].to_string(),
                value: console_value(value_raw),
            })
        })
        .collect()
}

/// Bare tokens stay strings; valid JSON literals parse (numbers, bools,
/// null, quoted strings, arrays, objects).
fn console_value(raw: &str) -> Value {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Value::String(String::new());
    }
    serde_json::from_str(trimmed).unwrap_or(Value::String(trimmed.to_string()))
}

fn parse_usize(raw: &str, name: &str) -> Result<usize> {
    raw.trim()
        .parse::<usize>()
        .map_err(|_| ManagerError::Validation(format!("{name} must be a non-negative integer")))
}
