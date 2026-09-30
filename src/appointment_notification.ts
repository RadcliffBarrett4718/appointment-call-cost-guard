import { z } from "zod";
import type { ModelMessages } from "./infrai_cost_client.js";

export const appointmentRequestSchema = z.object({
  appointmentId: z.string().min(1),
  patientReference: z.string().min(1),
  startsAt: z.iso.datetime(),
  clinicName: z.string().min(1),
  status: z.enum(["scheduled", "rescheduled", "cancelled"]),
  channel: z.enum(["sms", "email"]),
  maxCallCostUsd: z.number().positive()
});

export type AppointmentRequest = z.infer<typeof appointmentRequestSchema>;

export type NotificationResult = {
  appointmentId: string;
  decision: "send" | "hold" | "skip";
  reason: string;
  estimatedCostUsd: number;
  actualCostUsd: number | null;
  servedBy: string | null;
  notification: string | null;
};

export type NotificationGateway = {
  estimate(messages: ModelMessages, expectedOutputTokens: number): Promise<number>;
  writeNotification(messages: ModelMessages, requestId: string): Promise<{
    text: string;
    actualCostUsd: number;
    servedBy: string | null;
  }>;
};

export async function prepareAppointmentNotification(
  input: AppointmentRequest,
  gateway: NotificationGateway
): Promise<NotificationResult> {
  if (input.status === "cancelled") {
    return result(input, "skip", "cancelled appointments do not receive an operational reminder", 0);
  }

  const messages = notificationMessages(input);
  const estimatedCostUsd = await gateway.estimate(messages, 120);
  if (estimatedCostUsd > input.maxCallCostUsd) {
    return result(input, "hold", "estimated call cost exceeds this workflow limit", estimatedCostUsd);
  }

  const written = await gateway.writeNotification(messages, `appointment-${input.appointmentId}`);
  return {
    appointmentId: input.appointmentId,
    decision: "send",
    reason: "operational reminder approved",
    estimatedCostUsd,
    actualCostUsd: written.actualCostUsd,
    servedBy: written.servedBy,
    notification: written.text
  };
}

function notificationMessages(input: AppointmentRequest): ModelMessages {
  return [
    {
      role: "system",
      content: "Write a brief appointment logistics notification. Include no diagnosis, treatment advice, or clinical detail. Ask the patient to contact the clinic for medical questions."
    },
    {
      role: "user",
      content: `Channel: ${input.channel}\nClinic: ${input.clinicName}\nAppointment status: ${input.status}\nStarts at: ${input.startsAt}\nPatient reference: ${input.patientReference}`
    }
  ];
}

function result(
  input: AppointmentRequest,
  decision: "hold" | "skip",
  reason: string,
  estimatedCostUsd: number
): NotificationResult {
  return {
    appointmentId: input.appointmentId,
    decision,
    reason,
    estimatedCostUsd,
    actualCostUsd: null,
    servedBy: null,
    notification: null
  };
}
