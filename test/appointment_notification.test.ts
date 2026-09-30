import assert from "node:assert/strict";
import test from "node:test";
import { prepareAppointmentNotification, type NotificationGateway } from "../src/appointment_notification.js";

test("holds an appointment notification before the model call when its estimate is over the per-call limit", async () => {
  let modelCalls = 0;
  const gateway: NotificationGateway = {
    async estimate() { return 0.031; },
    async writeNotification() {
      modelCalls += 1;
      return { text: "unused", actualCostUsd: 0, servedBy: null };
    }
  };

  const result = await prepareAppointmentNotification({
    appointmentId: "appt-1842",
    patientReference: "patient-73",
    startsAt: "2026-10-05T09:30:00.000Z",
    clinicName: "Harbor Family Clinic",
    status: "rescheduled",
    channel: "sms",
    maxCallCostUsd: 0.02
  }, gateway);

  assert.equal(result.decision, "hold");
  assert.equal(result.estimatedCostUsd, 0.031);
  assert.equal(result.notification, null);
  assert.equal(modelCalls, 0);
});
