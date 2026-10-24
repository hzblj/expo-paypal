package com.hzblj.expopaypal

import android.annotation.SuppressLint
import android.content.Context
import com.paypal.android.paymentbuttons.PayLaterButton
import com.paypal.android.paymentbuttons.PaymentButton
import com.paypal.android.paymentbuttons.PaymentButtonShape
import com.paypal.android.paymentbuttons.PaymentButtonSize
import com.paypal.android.paymentbuttons.PayPalButton
import com.paypal.android.paymentbuttons.PayPalButtonColor
import com.paypal.android.paymentbuttons.PayPalButtonLabel
import com.paypal.android.paymentbuttons.PayPalCreditButton
import com.paypal.android.paymentbuttons.PayPalCreditButtonColor
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * One of the SDK's own payment buttons: PayPal, Pay Later or PayPal Credit. A different kind builds a new button; the
 * rest of its look is set in place. Laid out by Android inside the box React Native gives the view.
 */
@SuppressLint("ViewConstructor")
class PayPalButtonView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true

  // Not `onPress`: React Native registers `topPress` as a bubbling event, and a direct one by that name throws.
  private val onButtonPress by EventDispatcher<Unit>()

  var kind = "paypal"
  var color = "gold"
  var label: String? = null
  var shape = "rounded"
  var cornerRadius: Double? = null
  var size = "medium"
  var disabled = false

  private var button: PaymentButton<*>? = null
  private var builtKind: String? = null

  fun update() {
    val button = button?.takeIf { builtKind == kind } ?: rebuild()

    when (button) {
      is PayPalButton -> {
        button.color = payPalColor()
        // `small` shows the wordmark alone, as the iOS SDK's collapsed size does.
        button.label = if (size == "small") PayPalButtonLabel.PAYPAL else payPalLabel()
      }
      is PayLaterButton -> button.color = payPalColor()
      is PayPalCreditButton -> button.color = creditColor()
    }
    button.size = when (size) {
      "small" -> PaymentButtonSize.SMALL
      "large" -> PaymentButtonSize.LARGE
      else -> PaymentButtonSize.MEDIUM
    }
    // `shape` resets the custom radius, so it goes first.
    button.shape = when (shape) {
      "rectangle" -> PaymentButtonShape.RECTANGLE
      "pill" -> PaymentButtonShape.PILL
      else -> PaymentButtonShape.ROUNDED
    }
    cornerRadius?.let { button.customCornerRadius = (it * resources.displayMetrics.density).toFloat() }
    button.isEnabled = !disabled
    button.alpha = if (disabled) 0.5f else 1f
  }

  private fun rebuild(): PaymentButton<*> {
    button?.let { removeView(it) }

    val next: PaymentButton<*> = when (kind) {
      "payLater" -> PayLaterButton(context)
      "credit" -> PayPalCreditButton(context)
      else -> PayPalButton(context)
    }
    next.setOnClickListener {
      if (!disabled) {
        onButtonPress(Unit)
      }
    }
    addView(next, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    button = next
    builtKind = kind
    return next
  }

  private fun payPalColor() = when (color) {
    "blue" -> PayPalButtonColor.BLUE
    "white" -> PayPalButtonColor.WHITE
    "black" -> PayPalButtonColor.BLACK
    "silver" -> PayPalButtonColor.SILVER
    else -> PayPalButtonColor.GOLD
  }

  private fun creditColor() = when (color) {
    "black" -> PayPalCreditButtonColor.BLACK
    "white" -> PayPalCreditButtonColor.WHITE
    else -> PayPalCreditButtonColor.DARK_BLUE
  }

  private fun payPalLabel() = when (label) {
    "checkout" -> PayPalButtonLabel.CHECKOUT
    "buyNow" -> PayPalButtonLabel.BUY_NOW
    "payWith" -> PayPalButtonLabel.PAY
    else -> PayPalButtonLabel.PAYPAL
  }
}
