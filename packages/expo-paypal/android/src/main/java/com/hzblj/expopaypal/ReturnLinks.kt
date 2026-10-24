package com.hzblj.expopaypal

/**
 * Where PayPal brings the buyer back: the https success and cancel links (App Links) when the app has them, and the
 * custom scheme. Plain Kotlin, so the JVM tests run it.
 */
data class ReturnLinks(
  val scheme: String,
  /** `<returnUrl>/success`, or empty without an https base. */
  val successUrl: String,
  /** `<returnUrl>/cancel`, or empty without an https base. */
  val cancelUrl: String
) {
  /** Card 3D Secure returns through the scheme: it needs no App Link. */
  val cardReturnUrl: String
    get() = "$scheme://$CALLBACK_PATH" + "card-contingency"

  /** Whether [url] is PayPal bringing the buyer back: one of the https links, or the SDKs' path under the scheme. */
  fun matches(url: String): Boolean {
    val text = url.lowercase()

    if (scheme.isNotEmpty() && text.startsWith("${scheme.lowercase()}://$CALLBACK_PATH")) {
      return true
    }
    return listOf(successUrl, cancelUrl).any { link ->
      if (link.isEmpty() || !text.startsWith(link.lowercase())) {
        false
      } else {
        val rest = text.substring(link.length)
        rest.isEmpty() || rest.startsWith("?") || rest.startsWith("/")
      }
    }
  }

  companion object {
    /** The path both SDKs give a custom-scheme return: `<scheme>://x-callback-url/paypal-sdk/…`. */
    const val CALLBACK_PATH = "x-callback-url/paypal-sdk/"

    /** From the base the config plugin writes to the manifest, the way the JavaScript side derives the two links. */
    fun fromBase(scheme: String, base: String?): ReturnLinks {
      val trimmed = base.orEmpty().trimEnd('/')
      return ReturnLinks(
        scheme = scheme,
        successUrl = if (trimmed.isEmpty()) "" else "$trimmed/success",
        cancelUrl = if (trimmed.isEmpty()) "" else "$trimmed/cancel"
      )
    }
  }
}
