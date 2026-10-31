/** What the sign-in screen says when the API drops a session. A demo session expires on its own, so say that. */
export function sessionEndedMessage(wasDemo: boolean): string {
  return wasDemo
    ? "Your demo has ended. Start it again, or sign in with GitHub to see your own pull requests."
    : "Your session has ended. Sign in again to continue.";
}
