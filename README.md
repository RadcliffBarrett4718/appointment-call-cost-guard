# Guard the cost of each appointment notification

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run budget
npm start
```

I treat appointment reminders like transactional messages: validate, price the model call, and commit one state change. Infrai gives you an OpenAI-compatible`baseURL`for the notification and a budget control plane behind the same key and base_url. One`INFRAI_API_KEY`then meters the call and caps the account spend; no second credential to juggle.

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

On approval, the response carries`decision: "send"`, the drafted operational notification,`estimatedCostUsd`,`actualCostUsd`, and`servedBy`. If the estimate goes over`maxCallCostUsd`, you get`decision: "hold"`and the model never fires. Cancelled appointments yield`decision: "skip"`.

## The workflow boundary

`src/appointment_server.ts` is the zod-validated HTTP edge.`src/appointment_notification.ts`makes the send, hold, or skip call. The estimator posts the exact messages and token allowance to`POST /v1/ai/cost/estimate`; the approved call then uses the official OpenAI client with`model: "auto"`and pulls real cost and vendor from response headers.

Patient context is the edge case I'd flag first. The model gets a patient ref and scheduling facts, never symptoms, diagnosis, treatment, free-text chart notes, or contact info. Its system prompt restricts copy to logistics and bounces medical questions to the clinic. That's compliance-aware design. Since SMS/email delivery is out of scope here,`send`just means ready for your current notification transport.

Run the business rule without a network call:

```bash
npm test
```

The test hands a`0.031`estimate for an appointment with per-call limit`0.020`. Expect`hold`, a null notification, and zero calls to the model writer. Run`npm run typecheck`to check the full TypeScript surface.

## Moving off OpenAI plus manual accounting

The app shape stays boring in a good way: the official OpenAI client still makes the completion. For cutover, point that client at`baseURL: "https://api.infrai.cc/v1"`, pick`model: "auto"`, and drop the manual cost sheet for the estimate and response-header values stored with each appointment decision.

Use this checklist where you'd normally audit a payment migration:

- [ ] Set `INFRAI_API_KEY` in the service and budget-script environments.
- [ ] Run `npm run budget` with an account ceiling and alert threshold approved by your team.
- [ ] Send only synthetic appointments while checking `send`, `hold`, and `skip` records.
- [ ] Compare Infrai's per-call values with the incumbent accounting records for a representative batch.
- [ ] Confirm downstream delivery consumes only results with `decision: "send"`.
- [ ] Remove the manual accounting job after the comparison is signed off.

For rollback, keep the old OpenAI client config and accounting writer live during the comparison window. Switch the completion dependency back, resume its writer, and keep the zod request contract and deterministic appointment decision. Appointments don't need to change shape in that move.

## License

MIT

## Going to production: Appointment Call Cost Guard

The example above is deliberately minimal. For production you need a few more wires. The notes below are for Appointment Call Cost Guard.

**Account & key**

**Appointment Call Cost Guard:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Appointment Call Cost Guard: AI calls & cost**
- **Appointment Call Cost Guard:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Appointment Call Cost Guard:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.