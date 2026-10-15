/**
 * #280/#274：AI 运行时 v2 的存储业务操作（审批行读写 + 目标指纹），不暴露表本身。
 * 经 `storagePort()` 转给当前实现（ADR-0048）。
 */
import { storagePort } from './storagePort';

export const getTurn = <T>(conversationId: string) =>
  storagePort().turns.getTurn<T>(conversationId);
export const putTurn = <
  T extends { conversationId: string; createdAt?: unknown; expiresAt?: unknown },
>(
  row: T,
) => storagePort().turns.putTurn(row);
export const deleteTurn = (conversationId: string) =>
  storagePort().turns.deleteTurn(conversationId);
export const sweepExpiredTurns = (now: number) => storagePort().turns.sweepExpiredTurns(now);
export const fingerprintTarget = (id: string) => storagePort().fingerprintTarget(id);
