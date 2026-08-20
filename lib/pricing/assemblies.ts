import type {
  Assembly,
  ComponentCost,
  CostByKind,
  CostItem,
  LineItem,
  Quantity,
} from "./types";

export function indexCostItems(items: CostItem[]): Map<string, CostItem> {
  return new Map(items.map((item) => [item.id, item]));
}

/**
 * Roll one assembly up to a priced line item at the given quantity.
 *
 * - wasteFactorPct inflates the component quantity (material overage)
 * - burdenPct inflates the component cost (labor burden)
 * - productionRate converts assembly quantity to hours: qty / rate
 */
export function rollupAssembly(
  assembly: Assembly,
  quantity: Quantity,
  costItemsById: Map<string, CostItem>,
): LineItem {
  if (quantity.unit !== assembly.unit) {
    throw new Error(
      `Quantity unit ${quantity.unit} does not match assembly "${assembly.id}" unit ${assembly.unit}`,
    );
  }

  const costByKind: CostByKind = {
    material: 0,
    labor: 0,
    equipment: 0,
    disposal: 0,
  };

  const components: ComponentCost[] = assembly.components.map((component) => {
    const item = costItemsById.get(component.costItemId);
    if (!item) {
      throw new Error(
        `Assembly "${assembly.id}" references unknown cost item "${component.costItemId}"`,
      );
    }

    let baseQty: number;
    if (component.productionRate !== undefined) {
      if (component.qtyPerUnit !== undefined) {
        throw new Error(
          `Component "${component.costItemId}" in assembly "${assembly.id}" sets both qtyPerUnit and productionRate`,
        );
      }
      if (component.productionRate <= 0) {
        throw new Error(
          `Component "${component.costItemId}" in assembly "${assembly.id}" has non-positive productionRate`,
        );
      }
      baseQty = quantity.value / component.productionRate;
    } else if (component.qtyPerUnit !== undefined) {
      baseQty = quantity.value * component.qtyPerUnit;
    } else {
      throw new Error(
        `Component "${component.costItemId}" in assembly "${assembly.id}" needs qtyPerUnit or productionRate`,
      );
    }

    const wasteMultiplier = 1 + (item.wasteFactorPct ?? 0) / 100;
    const burdenMultiplier = 1 + (item.burdenPct ?? 0) / 100;
    const effectiveQty = baseQty * wasteMultiplier;
    const extendedCost = effectiveQty * item.unitCost * burdenMultiplier;

    costByKind[item.kind] += extendedCost;

    return {
      costItemId: item.id,
      name: item.name,
      kind: item.kind,
      quantity: effectiveQty,
      unit: item.unit,
      unitCost: item.unitCost,
      extendedCost,
    };
  });

  const directCost = components.reduce((sum, c) => sum + c.extendedCost, 0);

  return {
    assemblyId: assembly.id,
    description: assembly.name,
    quantity,
    components,
    costByKind,
    directCost,
  };
}
