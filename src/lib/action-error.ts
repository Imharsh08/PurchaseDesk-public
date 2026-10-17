/**
 * An error whose message is meant for the user ("Only an approver can do that."). Thrown by business
 * code; server actions and the API show its message instead of a generic failure.
 */
export class ActionError extends Error {}
