/**
 * #280/#274：写一条审计行的存储操作，调用方不再直连 db 桶。
 * 经 `storagePort()` 转给当前实现（ADR-0048）。
 */
import { storagePort } from './storagePort';
import type { AuditLogDocType } from './types';

export const insertAuditLog = (row: AuditLogDocType) => storagePort().audit.insertAuditLog(row);
