# Notification Rules Documentation

This guide explains how to customize your browser tracking notifications in `~/.config/pomodorocli/config.json`.

## 1. Available Variables for Conditions
When evaluating a condition, the system passes the following variables into the rules engine:

* **`mode`** (`string`): The current state of the Pomodoro timer. Can be `'work'`, `'break'`, or `'idle'`.
* **`domain_flagged`** (`string`): The category assigned to the domain in your `domainRules` (e.g., `'W'`, `'SF'`, `'O'`). If the domain isn't in your rules, it defaults to `'Unknown'`.
* **`past_time_today`** (`number`): The total active time spent on the current domain today, in **minutes**.
* **`past_time_continuous`** (`number`): The uninterrupted time you've spent actively focused on the current domain right now, in **minutes**.
* **`is_active`** (`boolean`): `true` if this domain is currently the focused window/tab.
* **`is_audible`** (`boolean`): `true` if this domain is currently playing audio.
* **`is_paused`** (`boolean`): `true` if the timer is currently paused.
* **`domain`** (`string`): The base domain name (e.g., `'youtube.com'`).

## 2. Available Variables for the Message String
You can use template strings in the `message` field (e.g. `Time for a break from ${domain}`):

* **`${domain}`**: The domain name.
* **`${mode}`**: Current pomodoro mode.
* **`${past_time_today}`**: Number of minutes spent today.
* **`${past_time_continuous}`**: Number of minutes spent continuously.
* **`${past_time_today_formatted}`**: Nicely formatted time string (e.g., `1h 15m`).

## 3. Formatting Conditions (Jexl Syntax)
We are using **Jexl** as the expression parser, which supports a Python/JS-like syntax. Here are a few examples of how to combine variables:

* **Basic comparison:** `mode == "work"`
* **Multiple conditions (AND):** `mode == "work" && past_time_today > 30`
* **Multiple conditions (OR):** `mode != "work" || is_audible`
* **Checking arrays (IN):** `domain_flagged in ["W", "SF"]`
* **Grouping with parentheses:** `(mode == "work" || mode == "idle") && past_time_continuous > 15`
* **Pausing check:** `!is_paused`

## 4. What happens if you make a mistake?
The tracker is designed to be fully fault-tolerant:
1. **Invalid Syntax:** If you write invalid syntax like `mode === "work"` (Jexl expects `==` instead of `===`) or miss a bracket, the background daemon wraps the execution in a `try/catch`. It will silently fail and simply skip that specific rule without crashing the tracking daemon or the UI.
2. **Incorrect Variables:** If you type a variable that doesn't exist (e.g., `time_spent > 15`), Jexl will resolve `time_spent` to `undefined`. A comparison like `undefined > 15` will simply return `false`, so the rule will safely be ignored.

## Debugging
If you ever suspect a rule isn't working, you can check the daemon logs by stopping your normal tracking server and manually running `pomodorocli daemon` in a separate terminal to view any printed rule evaluation errors.
