// PDF de una cotización con el logo y los datos del negocio. Se genera en el
// navegador; jsPDF se carga solo cuando se pide el PDF para no pesar en el
// arranque de la app.

import type { Business, QuoteWithItems } from './types'
import { formatCOP, formatDate, formatDay } from './format'

export async function downloadQuotePdf(business: Business, quote: QuoteWithItems): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 48
  let y = 56

  // Encabezado: logo + datos del negocio a la izquierda, número a la derecha.
  let textX = marginX
  if (business.logo_url) {
    try {
      const props = doc.getImageProperties(business.logo_url)
      const h = 56
      const w = Math.min(120, (props.width / props.height) * h)
      doc.addImage(business.logo_url, marginX, y - 16, w, h)
      textX = marginX + w + 16
    } catch {
      // Un logo corrupto no debe impedir generar la cotización.
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(business.name, textX, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90)
  const contact = [
    business.legal_id && `NIT/C.C. ${business.legal_id}`,
    [business.address, business.city].filter(Boolean).join(', '),
    [business.phone, business.email].filter(Boolean).join(' · '),
    business.instagram && `Instagram ${business.instagram.startsWith('@') ? business.instagram : `@${business.instagram}`}`,
  ].filter(Boolean) as string[]
  contact.forEach((line, i) => doc.text(line, textX, y + 14 + i * 12))

  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('COTIZACIÓN', pageWidth - marginX, y, { align: 'right' })
  doc.setFontSize(11)
  doc.text(`N.º ${String(quote.number).padStart(4, '0')}`, pageWidth - marginX, y + 16, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text(`Fecha: ${formatDate(quote.created_at)}`, pageWidth - marginX, y + 30, { align: 'right' })
  if (quote.valid_until) doc.text(`Válida hasta: ${formatDay(quote.valid_until)}`, pageWidth - marginX, y + 42, { align: 'right' })

  y = Math.max(y + 16 + contact.length * 12, y + 56) + 24
  doc.setDrawColor(220)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 22

  // Cliente
  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Para:', marginX, y)
  doc.setFont('helvetica', 'normal')
  const c = quote.customer
  const customerLines = c
    ? [c.name, c.document && `NIT/C.C. ${c.document}`, [c.address, c.city].filter(Boolean).join(', '), [c.phone, c.email].filter(Boolean).join(' · ')]
        .filter(Boolean) as string[]
    : ['Cliente']
  customerLines.forEach((line, i) => doc.text(line, marginX + 36, y + i * 13))
  y += customerLines.length * 13 + 14

  // Productos
  const subtotal = quote.quote_items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Producto', ...['Cant.', 'Precio unit.', 'Total'].map((content) => ({ content, styles: { halign: 'right' as const } }))]],
    body: quote.quote_items.map((i) => [i.description, String(i.quantity), formatCOP(i.unit_price), formatCOP(i.quantity * i.unit_price)]),
    styles: { fontSize: 9.5, cellPadding: 7, textColor: 20 },
    headStyles: { fillColor: [31, 122, 77], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 50 }, 2: { halign: 'right', cellWidth: 95 }, 3: { halign: 'right', cellWidth: 95 } },
    alternateRowStyles: { fillColor: [246, 246, 243] },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 18

  // Totales
  const totals: [string, string][] = [['Subtotal', formatCOP(subtotal)]]
  if (quote.discount > 0) totals.push(['Descuento', `−${formatCOP(quote.discount)}`])
  if (quote.shipping_cost > 0) totals.push(['Envío', formatCOP(quote.shipping_cost)])
  const total = Math.max(0, subtotal - quote.discount) + quote.shipping_cost
  doc.setFontSize(10)
  totals.forEach(([label, value]) => {
    doc.setTextColor(90)
    doc.text(label, pageWidth - marginX - 150, y)
    doc.setTextColor(0)
    doc.text(value, pageWidth - marginX, y, { align: 'right' })
    y += 15
  })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Total', pageWidth - marginX - 150, y + 4)
  doc.text(formatCOP(total), pageWidth - marginX, y + 4, { align: 'right' })
  y += 34

  // Notas y condiciones
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(70)
  const extra = [quote.notes, business.quote_terms].filter(Boolean).join('\n\n')
  if (extra) {
    const lines = doc.splitTextToSize(extra, pageWidth - marginX * 2)
    doc.text(lines, marginX, y)
  }

  doc.save(`Cotizacion-${business.name.replace(/\s+/g, '')}-${String(quote.number).padStart(4, '0')}.pdf`)
}
