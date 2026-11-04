export const DEFAULT_STAGES = [
  ["RESEARCHING", "Researching"], ["INTERESTED", "Interested"], ["NETWORKING", "Networking"], ["APPLIED", "Applied"],
  ["ONLINE_ASSESSMENT", "Online assessment"], ["INTERVIEW", "Interview"], ["FINAL_ROUND", "Final round"], ["OFFER", "Offer"],
  ["ACCEPTED", "Accepted"], ["REJECTED", "Rejected"],
] as const;

export const CONTACT_STAGES = [
  ["DISCOVERED", "Discovered"], ["SHORTLISTED", "Shortlisted"], ["MESSAGE_DRAFTED", "Message drafted"], ["CONTACTED", "Contacted"],
  ["RESPONDED", "Responded"], ["CALL_SCHEDULED", "Call scheduled"], ["CALL_COMPLETED", "Call completed"], ["FOLLOW_UP", "Follow-up"], ["REFERRAL", "Referral"],
] as const;

export const OPP_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "outline" }> = {
  VERIFIED_OPEN: { label: "Verified open", tone: "success" },
  PREVIOUSLY_OPEN_UNKNOWN: { label: "Status unknown", tone: "outline" },
  CONFIRMED_CLOSED: { label: "Closed", tone: "danger" },
  EXPECTED_UNCONFIRMED: { label: "Expected, unconfirmed", tone: "warning" },
};

export const PIPELINES: Record<string, string> = { GRADUATE_PROGRAMME: "Graduate programme", INTERNSHIP: "Internship (convertible)", PERMANENT: "Permanent role", OTHER: "Other" };
