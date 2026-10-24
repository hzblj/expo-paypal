package com.hzblj.expopaypal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class FlowSlotTest {
  private class FakeIntent(val name: String)

  private val slot = FlowSlot<FakeIntent>()
  private val settled = mutableListOf<Map<String, Any?>>()

  private fun begin(flow: String = "checkout") = slot.begin(flow, "ID") { settled.add(it) }

  @Test
  fun oneFlowAtATime() {
    val token = begin()

    assertEquals(null, begin("vault"))
    assertTrue(slot.finish(token!!, mapOf("status" to "approved")))
    assertEquals(listOf(mapOf<String, Any?>("status" to "approved")), settled)
    assertTrue(begin("vault") != null)
  }

  @Test
  fun settlesOnceAndDropsLateAnswers() {
    val first = begin()!!

    assertTrue(slot.finish(first, mapOf("status" to "canceled")))
    assertFalse(slot.finish(first, mapOf("status" to "approved")))

    val second = begin()!!

    assertFalse(slot.finish(first, mapOf("status" to "approved")))
    assertTrue(slot.finish(second, mapOf("status" to "approved")))
    assertEquals(2, settled.size)
  }

  @Test
  fun nothingIsAReturnBeforeTheFlowLaunched() {
    begin()

    assertNull(slot.returnCandidate(FakeIntent("return")))
  }

  @Test
  fun theLaunchIntentAgainMeansTheBuyerCameBackByHand() {
    val token = begin()!!
    val launch = FakeIntent("launch")

    slot.launched(token, launch)

    assertNull(slot.returnCandidate(launch))
    assertNull(slot.returnCandidate(null))
  }

  @Test
  fun aNewIntentAfterLaunchIsWorthAskingAbout() {
    val token = begin()!!
    val launch = FakeIntent("launch")
    val back = FakeIntent("return")

    slot.launched(token, launch)

    assertSame(back, slot.returnCandidate(back))
  }

  @Test
  fun launchingAnEndedFlowChangesNothing() {
    val token = begin()!!

    slot.finish(token, mapOf("status" to "canceled"))
    slot.launched(token, FakeIntent("launch"))

    assertNull(slot.active)
  }
}
