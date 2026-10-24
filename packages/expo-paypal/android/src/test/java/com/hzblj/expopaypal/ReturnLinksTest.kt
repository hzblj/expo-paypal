package com.hzblj.expopaypal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReturnLinksTest {
  private val links = ReturnLinks.fromBase("shop", "https://shop.example.com/paypal/")

  @Test
  fun derivesTheLinksFromTheBaseLikeJavaScript() {
    assertEquals("https://shop.example.com/paypal/success", links.successUrl)
    assertEquals("https://shop.example.com/paypal/cancel", links.cancelUrl)
    assertEquals("", ReturnLinks.fromBase("shop", null).successUrl)
  }

  @Test
  fun cardChallengesReturnThroughTheScheme() {
    assertEquals("shop://x-callback-url/paypal-sdk/card-contingency", links.cardReturnUrl)
    assertTrue(links.matches(links.cardReturnUrl + "?state=1"))
  }

  @Test
  fun matchesTheReturnsAndNothingElse() {
    listOf(
      "https://shop.example.com/paypal/success?token=1&PayerID=2",
      "https://shop.example.com/paypal/cancel",
      "HTTPS://SHOP.EXAMPLE.COM/paypal/success",
      "shop://x-callback-url/paypal-sdk/paypal-checkout/success?token=1",
    ).forEach { assertTrue(it, links.matches(it)) }

    listOf(
      "https://shop.example.com/paypal/successful",
      "https://shop.example.com/products/1",
      "shop://orders/1",
      "other://x-callback-url/paypal-sdk/paypal-checkout",
    ).forEach { assertFalse(it, links.matches(it)) }
  }
}
