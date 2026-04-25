import { PDFDocument, PDFPage } from 'pdf-lib';
import { generateDefaultPdf } from './pdf-default.js';

export interface TicketForPdf {
  id: string;
  ticketCode: string;
  holderName: string;
  holderEmail?: string;
  isInternal: boolean;
  category: {
    name: string;
    colorHex?: string;
    templateUrl?: string;
    templateMeta?: string;
  };
  orderId: string;
  order: {
    id: string;
    event: {
      title: string;
      startDate: Date;
      endDate: Date;
      city: string;
      venue?: { name: string; address: string };
    };
    eo: { companyName: string; logoUrl?: string };
  };
}

export interface QrPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

async function downloadFromR2(url: string): Promise<Buffer> {
  if (!url) {
    throw new Error('Template URL is required');
  }
  throw new Error('R2 download not implemented');
}

export async function generateCustomPdf(
  ticket: TicketForPdf,
  order: TicketForPdf['order'],
  qrImageBuffer: Buffer
): Promise<Buffer> {
  if (!qrImageBuffer || qrImageBuffer.length === 0) {
    throw new Error('QR image buffer is empty or null');
  }

  if (!ticket.category.templateUrl) {
    console.warn(
      `Template URL not set for ticket ${ticket.id}, falling back to default template`
    );
    return generateDefaultPdf(ticket, order, qrImageBuffer);
  }

  let templateMeta: QrPosition | null = null;
  try {
    templateMeta = JSON.parse(ticket.category.templateMeta || '{}') as QrPosition;
  } catch (parseError) {
    console.warn(
      `Invalid templateMeta for ticket ${ticket.id}, falling back to default template`
    );
    return generateDefaultPdf(ticket, order, qrImageBuffer);
  }

  try {
    const templateBytes = await downloadFromR2(ticket.category.templateUrl);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const pages = pdfDoc.getPages();

    let targetPage = pages[0];
    if (!templateMeta || pages.length < (templateMeta.page || 1)) {
      console.warn(
        `Page ${templateMeta?.page || 1} not found in template for ticket ${ticket.id}, using page 1`
      );
      targetPage = pages[0];
    } else {
      targetPage = pages[(templateMeta.page || 1) - 1];
    }

    const qrImage = await pdfDoc.embedPng(qrImageBuffer);
    const qrScale = templateMeta.width / qrImage.width;
    const qrHeight = qrImage.height * qrScale;

    targetPage.drawImage(qrImage, {
      x: templateMeta.x,
      y: templateMeta.y,
      width: templateMeta.width,
      height: qrHeight,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error(
      `Error generating custom PDF for ticket ${ticket.id}:`,
      error instanceof Error ? error.message : String(error)
    );
    return generateDefaultPdf(ticket, order, qrImageBuffer);
  }
}

export async function validatePdfTemplate(
  templateBuffer: Buffer,
  metaCoordinates: unknown
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    await PDFDocument.load(templateBuffer);
  } catch {
    errors.push('Invalid PDF file - cannot be loaded by pdf-lib');
    return { valid: false, errors };
  }

  const pdfDoc = await PDFDocument.load(templateBuffer);
  const pages = pdfDoc.getPages();
  const meta = metaCoordinates as QrPosition | null;

  if (!meta) {
    errors.push('Invalid template metadata - not a valid object');
    return { valid: false, errors };
  }

  if (!meta.page || meta.page < 1) {
    errors.push('Page number must be greater than 0');
  } else if (meta.page > pages.length) {
    errors.push(`Page ${meta.page} does not exist - PDF has ${pages.length} page(s)`);
  }

  if (typeof meta.x !== 'number' || typeof meta.y !== 'number') {
    errors.push('X and Y coordinates must be numbers');
  }

  if (typeof meta.width !== 'number' || typeof meta.height !== 'number') {
    errors.push('Width and height must be numbers');
  }

  if (errors.length === 0) {
    const pageSize = pages[Math.min(meta.page, pages.length) - 1].getSize();
    if (meta.x < 0 || meta.y < 0) {
      errors.push('X and Y coordinates cannot be negative');
    }
    if (meta.x + meta.width > pageSize.width) {
      errors.push(
        `QR width exceeds page width (${pageSize.width} points)`
      );
    }
    if (meta.y + meta.height > pageSize.height) {
      errors.push(
        `QR height exceeds page height (${pageSize.height} points)`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}