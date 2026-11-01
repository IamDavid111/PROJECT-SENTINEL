import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'

import { buildExportFileName, downloadExport } from '../../../lib/download'
import type { ExportAdmin, ExportUserRow } from './types'
import { getDepartmentLabel } from './userHelpers'

export const exportIntroduction = 'This User Management Register provides an administrative overview of user accounts configured within the SentinelQHSE platform. It presents the user identification details, assigned departments, roles, account statuses, and relevant administrative actions included in the export.\n\nThe register is intended to support user-account administration, access oversight, recordkeeping, and internal review. It reflects the information available in the platform at the time of export and should be interpreted in accordance with the organization\'s applicable access-control procedures and information-management requirements.\n\nThis document is intended for authorized administrative use. Its contents should be handled in accordance with applicable organizational confidentiality and data-protection requirements.'

export function exportCsv(rows: ExportUserRow[], generatedAt: Date) {
  const headers = ['User ID', 'Name', 'Employee ID', 'Department', 'Job Title', 'Role', 'Status', 'Action']
  const values = rows.map((row) => [row.userId, row.name, row.employeeId, row.department, row.jobTitle, row.role, row.status, row.action])
  // Quote every field and double embedded quotes so commas and line breaks remain part of a single CSV cell.
  const csvValue = (value: string) => `"${value.replaceAll('"', '""')}"`
  const csv = [headers, ...values].map((row) => row.map((value) => csvValue(String(value ?? ''))).join(',')).join('\n')
  downloadExport(new Blob([csv], { type: 'text/csv;charset=utf-8' }), buildExportFileName('User_Management_Register', 'csv', generatedAt))
}

export function exportPdf(rows: ExportUserRow[], admin: ExportAdmin, generatedAt: Date) {
  const pdf = new jsPDF({ orientation: 'landscape' })
  pdf.setTextColor('#0f172a')
  pdf.setFontSize(18)
  pdf.text('SentinelQHSE', 14, 16)
  pdf.setFontSize(14)
  pdf.text('User Management Register', 14, 25)
  pdf.setFontSize(10)
  pdf.setTextColor('#475569')
  pdf.text('User Access, Roles and Status Report', 14, 32)
  pdf.text(`Exported: ${generatedAt.toLocaleString()} | Records: ${rows.length} | Scope: Current filtered users`, 14, 39)
  pdf.setFontSize(8)
  const introLines = pdf.splitTextToSize(exportIntroduction, 265)
  pdf.text(introLines, 14, 47)
  const tableStart = 47 + introLines.length * 4 + 5
  autoTable(pdf, {
    startY: tableStart,
    head: [['User ID', 'Name', 'Employee ID', 'Department', 'Job Title', 'Role', 'Status', 'Action']],
    body: rows.map((row) => [row.userId, row.name, row.employeeId, row.department, row.jobTitle, row.role, row.status, row.action]),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [15, 74, 62] },
    didDrawPage: (data) => {
      pdf.setFontSize(8)
      pdf.setTextColor('#64748b')
      pdf.text(`SentinelQHSE User Management Register | Page ${data.pageNumber}`, 14, pdf.internal.pageSize.height - 8)
    },
  })
  const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableStart
  const signoffY = finalY + 14
  if (signoffY > pdf.internal.pageSize.height - 42) {
    pdf.addPage()
  }
  const visibleSignoffY = signoffY > pdf.internal.pageSize.height - 42 ? 18 : signoffY
  pdf.setTextColor('#0f172a')
  pdf.setFontSize(10)
  pdf.text('AUTHORIZED EXPORT — ADMINISTRATOR SIGN-OFF', 14, visibleSignoffY)
  pdf.setFontSize(8)
  pdf.text(`Authorized / Exported By: ${admin.fullName}`, 14, visibleSignoffY + 7)
  pdf.text(`Role: ${admin.role}`, 14, visibleSignoffY + 13)
  pdf.text(`Department: ${getDepartmentLabel(admin.department)}`, 14, visibleSignoffY + 19)
  pdf.text(`Date and Time of Export: ${generatedAt.toLocaleString()}`, 14, visibleSignoffY + 25)
  pdf.save(buildExportFileName('User_Management_Register', 'pdf', generatedAt))
}

export async function exportExcel(rows: ExportUserRow[], admin: ExportAdmin, generatedAt: Date) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('User Register')
  sheet.mergeCells('A1:H1')
  sheet.getCell('A1').value = 'SentinelQHSE — User Management Register'
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: '0F172A' } }
  sheet.mergeCells('A2:H2')
  sheet.getCell('A2').value = 'User Access, Roles and Status Report'
  sheet.getCell('A3').value = 'Exported'
  sheet.getCell('B3').value = generatedAt.toLocaleString()
  sheet.getCell('D3').value = 'Records'
  sheet.getCell('E3').value = rows.length
  sheet.mergeCells('A5:H7')
  sheet.getCell('A5').value = exportIntroduction
  sheet.getCell('A5').alignment = { wrapText: true, vertical: 'top' }
  const headerRow = sheet.addRow(['User ID', 'Name', 'Employee ID', 'Department', 'Job Title', 'Role', 'Status', 'Action'])
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4A3E' } }
  rows.forEach((row) => sheet.addRow([row.userId, row.name, row.employeeId, row.department, row.jobTitle, row.role, row.status, row.action]))
  sheet.addRow([])
  sheet.addRow(['AUTHORIZED EXPORT — ADMINISTRATOR SIGN-OFF'])
  sheet.addRow(['Authorized / Exported By', admin.fullName])
  sheet.addRow(['Role', admin.role])
  sheet.addRow(['Department', getDepartmentLabel(admin.department)])
  sheet.addRow(['Date and Time of Export', generatedAt.toLocaleString()])
  sheet.columns = [{ width: 24 }, { width: 24 }, { width: 18 }, { width: 22 }, { width: 24 }, { width: 28 }, { width: 14 }, { width: 16 }]
  sheet.eachRow((row) => row.eachCell((cell) => { cell.alignment = { ...cell.alignment, vertical: 'top', wrapText: true } }))
  const buffer = await workbook.xlsx.writeBuffer()
  downloadExport(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), buildExportFileName('User_Management_Register', 'xlsx', generatedAt))
}

export async function exportWord(rows: ExportUserRow[], admin: ExportAdmin, generatedAt: Date) {
  const header = ['User ID', 'Name', 'Employee ID', 'Department', 'Job Title', 'Role', 'Status', 'Action']
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: header.map((value) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: value, bold: true })] })] })) }),
      ...rows.map((row) => new TableRow({ children: [row.userId, row.name, row.employeeId, row.department, row.jobTitle, row.role, row.status, row.action].map((value) => new TableCell({ children: [new Paragraph(value)] })) })),
    ],
  })
  const document = new Document({ sections: [{ children: [
    new Paragraph({ text: 'SentinelQHSE', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: 'User Management Register', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: 'User Access, Roles and Status Report' }),
    new Paragraph({ text: `Exported: ${generatedAt.toLocaleString()} | Records: ${rows.length} | Scope: Current filtered users` }),
    new Paragraph({ text: exportIntroduction, spacing: { after: 240 } }),
    table,
    new Paragraph({ text: 'AUTHORIZED EXPORT — ADMINISTRATOR SIGN-OFF', heading: HeadingLevel.HEADING_2, spacing: { before: 360 } }),
    new Paragraph({ text: `Authorized / Exported By: ${admin.fullName}` }),
    new Paragraph({ text: `Role: ${admin.role}` }),
    new Paragraph({ text: `Department: ${getDepartmentLabel(admin.department)}` }),
    new Paragraph({ text: `Date and Time of Export: ${generatedAt.toLocaleString()}` }),
  ] }] })
  const buffer = await Packer.toBlob(document)
  downloadExport(buffer, buildExportFileName('User_Management_Register', 'docx', generatedAt))
}

