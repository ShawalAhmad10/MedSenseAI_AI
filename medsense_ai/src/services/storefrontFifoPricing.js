// Quote oldest arrivals in the order supplied by the inventory API.
export function fifoQuote(item) {
  let remaining = Number(item.quantity ?? item.qty ?? 1);
  if (!Array.isArray(item.fifoBatches) || !item.fifoBatches.length) {
    return [{ batch_id: item.batchId, quantity: remaining, unit_price: Number(item.price ?? item.unitPrice ?? 0), name: item.name }];
  }
  const allocations = [];
  for (const batch of item.fifoBatches) {
    const quantity = Math.min(remaining, Number(batch.stockQty));
    if (quantity > 0) allocations.push({ batch_id: batch.batchId, quantity,
      unit_price: Number(batch.salePrice), name: batch.name });
    remaining -= quantity;
    if (remaining <= 0) break;
  }
  return allocations;
}

export function fifoTotal(item) {
  return fifoQuote(item).reduce((sum, allocation) => sum + allocation.quantity * allocation.unit_price, 0);
}

export function fifoBreakdown(item) {
  return fifoQuote(item).map(allocation => `${allocation.quantity} × PKR ${allocation.unit_price.toFixed(2)}`).join(' + ');
}
