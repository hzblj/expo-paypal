package com.hzblj.expopaypal

/**
 * The one flow PayPal runs at a time, and how it ends: settled once, by the return or by the buyer coming back without
 * one. Plain Kotlin over a generic intent, so the JVM tests drive it.
 *
 * Android delivers the return as an intent: `onNewIntent` for the default single-task activity, the activity's own
 * intent otherwise. When the activity resumes after the flow launched, an intent other than the one it had at launch
 * may be the return; the same one means the buyer came back by hand (closed the browser tab, switched back from the
 * PayPal app), and the flow ends as cancelled.
 */
class FlowSlot<Intent : Any> {
  data class Active<Intent : Any>(
    val token: Int,
    val flow: String,
    val id: String,
    val settle: (Map<String, Any?>) -> Unit,
    /** The activity's intent when the flow launched; `null` until the browser or the PayPal app opened. */
    val launchIntent: Intent? = null,
    val launched: Boolean = false
  )

  var active: Active<Intent>? = null
    private set

  private var nextToken = 0

  /** Takes the slot and returns the flow's token, or `null` while another flow runs. */
  fun begin(flow: String, id: String, settle: (Map<String, Any?>) -> Unit): Int? {
    if (active != null) {
      return null
    }
    nextToken += 1
    active = Active(nextToken, flow, id, settle)
    return nextToken
  }

  /** The browser or the PayPal app opened: from now on, a return or a resume ends the flow. */
  fun launched(token: Int, activityIntent: Intent?) {
    val current = active ?: return
    if (current.token == token) {
      active = current.copy(launchIntent = activityIntent, launched = true)
    }
  }

  /** Settles the flow [token] started, once; a late answer for a flow that already ended is dropped. */
  fun finish(token: Int, outcome: Map<String, Any?>): Boolean {
    val current = active ?: return false
    if (current.token != token) {
      return false
    }
    active = null
    current.settle(outcome)
    return true
  }

  /** On resume: the intent worth asking the SDK about, or `null` when it can only be the launch intent again. */
  fun returnCandidate(activityIntent: Intent?): Intent? {
    val current = active ?: return null
    if (!current.launched || activityIntent == null || activityIntent === current.launchIntent) {
      return null
    }
    return activityIntent
  }
}
