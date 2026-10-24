package com.hzblj.expopaypal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PendingFlowTest {
  private class MemoryStore : PendingFlowStore {
    var json: String? = null

    override fun read() = json

    override fun write(json: String?) {
      this.json = json
    }
  }

  private val flow = PendingFlow(
    flow = "checkout",
    id = "ORDER",
    account = PendingFlow.Account("client", "merchant", "sandbox", null),
    links = ReturnLinks.fromBase("shop", "https://shop.example.com/paypal"),
    instanceState = "c3RhdGU="
  )

  @Test
  fun survivesTheRoundTripThroughJson() {
    assertEquals(flow, PendingFlow.fromJson(flow.toJson()))

    val partner = flow.copy(account = flow.account.copy(bnCode = "BN"))
    assertEquals(partner, PendingFlow.fromJson(partner.toJson()))
  }

  @Test
  fun dropsWhatItCannotRead() {
    assertNull(PendingFlow.fromJson(null))
    assertNull(PendingFlow.fromJson("not json"))
    assertNull(PendingFlow.fromJson("{\"flow\":\"checkout\"}"))
  }

  @Test
  fun theLedgerRecordsReadsAndClears() {
    val ledger = PendingFlowLedger(MemoryStore())

    assertNull(ledger.pending)
    ledger.record(flow)
    assertEquals(flow, ledger.pending)
    ledger.clear()
    assertNull(ledger.pending)
  }
}
