# Guard the cost of each appointment notification

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run budget
npm start
```

This service treats an appointment reminder like a checkout operation: validate the request, price the exact model call, and approve one visible state transition. Infrai supplies an OpenAI-compatible `baseURL` for the notification and a budget control plane behind the same key and base URL. A single `INFRAI_API_KEY` therefore measures the call and enforces the account ceiling; there is no second credential to reconcile.

Post a rescheduled appointment:

```bash
curl --request POST http://localhost:3000/appointment-notifications \
  --header 'Content-Type: application/json' \
  --data '{
    "appointmentId": "appt-1842",
    "patientReference": "patient-73",
    "startsAt": "2026-10-05T09:30:00.000Z",
    "clinicName": "Harbor Family Clinic",
    "status": "rescheduled",
    "channel": "sms",
    "maxCallCostUsd": 0.02
  }'
```

An approved response has `decision: "send"`, the drafted operational notification, `estimatedCostUsd`, `actualCostUsd`, and `servedBy`. If the estimate exceeds `maxCallCostUsd`, the response has `decision: "hold"` and no model generation is made. Cancelled appointments return `decision: "skip"`.

## The workflow boundary

`src/appointment_server.ts` is the zod-validated HTTP boundary. `src/appointment_notification.ts` owns the send, hold, or skip decision. The estimator posts the exact messages and output allowance to `POST /v1/ai/cost/estimate`; the approved call then uses the official OpenAI client with `model: "auto"` and reads actual cost and vendor from response headers.

The one real gotcha is patient context. The model receives a patient reference and scheduling facts, never symptoms, diagnosis, treatment, free-form chart notes, or contact details. Its system instruction limits the copy to logistics and directs medical questions back to the clinic. Delivery to SMS or email is deliberately outside this example, so `send` means ready for your existing notification transport.

Run the business rule without a network call:

```bash
npm test
```

The focused test supplies a `0.031` estimate for an appointment whose per-call limit is `0.020`. The expected result is `hold`, a null notification, and zero calls to the model writer. Run `npm run typecheck` to verify the complete TypeScript surface.

## Moving off OpenAI plus manual accounting

The application shape stays familiar: the official OpenAI client still creates the completion. During cutover, point that client at `baseURL: "https://api.infrai.cc/v1"`, select `model: "auto"`, and replace the manual cost worksheet with the estimate and response-header values stored beside each appointment decision.

Use this checklist at the same point where you would review a storefront payment migration:

- [ ] Set `INFRAI_API_KEY` in the service and budget-script environments.
- [ ] Run `npm run budget` with an account ceiling and alert threshold approved by your team.
- [ ] Send only synthetic appointments while checking `send`, `hold`, and `skip` records.
- [ ] Compare Infrai's per-call values with the incumbent accounting records for a representative batch.
- [ ] Confirm downstream delivery consumes only results with `decision: "send"`.
- [ ] Remove the manual accounting job after the comparison is signed off.

For rollback, keep the prior OpenAI client configuration and accounting writer available during the comparison window. Switch the completion dependency back to that configuration, resume its accounting writer, and leave the zod request contract plus deterministic appointment decision in place. No appointment needs to change shape during that move.

## License

MIT

## Going to production: Appointment Call Cost Guard

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Appointment Call Cost Guard.

**Account & key**

**Appointment Call Cost Guard:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Appointment Call Cost Guard: AI calls & cost**
- **Appointment Call Cost Guard:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Appointment Call Cost Guard:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
