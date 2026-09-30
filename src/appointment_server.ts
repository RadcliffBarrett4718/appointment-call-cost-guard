import { createServer } from "node:http";
import { ZodError } from "zod";
import { appointmentRequestSchema, prepareAppointmentNotification } from "./appointment_notification.js";
import { InfraiCostClient, InfraiError } from "./infrai_cost_client.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");
const gateway = new InfraiCostClient(apiKey);

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/appointment-notifications") {
    return send(response, 404, { error: "Route not found" });
  }

  try {
    const input = appointmentRequestSchema.parse(await readJson(request));
    const output = await prepareAppointmentNotification(input, gateway);
    return send(response, 200, output);
  } catch (error) {
    if (error instanceof ZodError) return send(response, 400, { error: "Invalid request", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.code, message: error.message });
    }
    return send(response, 500, { error: "Request could not be processed" });
  }
});

function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Appointment notification service listening on http://localhost:${port}`));
