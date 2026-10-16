/**
 * 父子链接只存在于同一份文稿里。跨文稿的 parentUnitId 不允许。
 */

export interface UnitParentRef {
  id: string;
  manuscriptId: string;
  parentUnitId?: string;
}

export function crossManuscriptParentLinks(
  units: readonly UnitParentRef[],
): { unitId: string; parentUnitId: string }[] {
  const manuscriptOf = new Map(units.map((unit) => [unit.id, unit.manuscriptId]));
  const links: { unitId: string; parentUnitId: string }[] = [];
  for (const unit of units) {
    if (unit.parentUnitId === undefined) continue;
    const parentManuscript = manuscriptOf.get(unit.parentUnitId);
    if (parentManuscript !== undefined && parentManuscript !== unit.manuscriptId) {
      links.push({ unitId: unit.id, parentUnitId: unit.parentUnitId });
    }
  }
  return links;
}
