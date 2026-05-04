/**
 * Debounced STT engine switch coordination (Phase C2 split).
 * Owns timer + monotonic token + switchingEngine flag used by VoiceInputService.switchEngine / stop.
 */

export const VOICE_INPUT_ENGINE_SWITCH_DEBOUNCE_MS = 300;

export class VoiceInputEngineSwitchCoordinator {
  private token = 0;
  private switching = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  get isSwitchingEngine(): boolean {
    return this.switching;
  }

  /** stop() / full invalidation: cancel debounce and drop switching state. */
  invalidate(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.token += 1;
    this.switching = false;
  }

  /**
   * Begin a new engine switch: cancel any pending debounced run, bump token, mark switching.
   * @returns monotonic token for this switch attempt (stale callbacks must no-op).
   */
  beginSwitch(): number {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.token += 1;
    this.switching = true;
    return this.token;
  }

  tokenMatches(switchToken: number): boolean {
    return switchToken === this.token;
  }

  /** Schedule the post-stop restart attempt (caller runs guards + promise chain). */
  scheduleDebounced(_switchToken: number, run: () => void): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      run();
    }, VOICE_INPUT_ENGINE_SWITCH_DEBOUNCE_MS);
  }

  /** Clears switching when the completing attempt still owns the current token. */
  clearSwitchingIfTokenCurrent(switchToken: number): void {
    if (this.tokenMatches(switchToken)) {
      this.switching = false;
    }
  }
}
