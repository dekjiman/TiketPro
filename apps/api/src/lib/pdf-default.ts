import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface TicketForPdf {
  id: string;
  ticketCode: string;
  holderName: string;
  holderEmail?: string;
  isInternal: boolean;
  category: {
    name: string;
    colorHex?: string;
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

function rgbHex(hex: string): number {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return 0;
  return (
    (parseInt(result[1], 16) << 16) |
    (parseInt(result[2], 16) << 8) |
    parseInt(result[3], 16)
  );
}

function formatEventDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export async function generateDefaultPdf(
  ticket: TicketForPdf,
  order: TicketForPdf['order'],
  qrImageBuffer: Buffer
): Promise<Buffer> {
  if (!qrImageBuffer || qrImageBuffer.length === 0) {
    throw new Error('QR image buffer is empty or null');
  }

  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const navyColor = rgb(0.118, 0.227, 0.373);
    const grayText = rgb(0.4, 0.4, 0.4);
    const lightGray = rgb(0.9, 0.9, 0.9);
    const amber = rgb(1, 0.843, 0);

    const margin = 40;
    const pageWidth = width - margin * 2;

    page.drawRectangle({
      x: 0,
      y: height - 62,
      width: width,
      height: 62,
      color: navyColor,
    });

    page.drawText('TiketPro', {
      x: margin,
      y: height - 35,
      size: 12,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    const eoNameWidth = helveticaBold.widthOfTextAtSize(order.eo.companyName, 12);
    page.drawText(order.eo.companyName, {
      x: width - margin - eoNameWidth,
      y: height - 35,
      size: 12,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    let y = height - 120;

    const eventTitle = order.event.title;
    const eventTitleWidth = helveticaBold.widthOfTextAtSize(eventTitle, 20);
    page.drawText(eventTitle, {
      x: (width - eventTitleWidth) / 2,
      y: y,
      size: 20,
      font: helveticaBold,
      color: navyColor,
    });

    y -= 30;

    const dateStr = formatEventDate(order.event.startDate);
    const dateWidth = helvetica.widthOfTextAtSize(dateStr, 12);
    page.drawText(dateStr, {
      x: (width - dateWidth) / 2,
      y: y,
      size: 12,
      font: helvetica,
      color: grayText,
    });

    y -= 22;

    const venueStr = order.event.venue
      ? `${order.event.venue.name}, ${order.event.city}`
      : order.event.city;
    const venueWidth = helvetica.widthOfTextAtSize(venueStr, 11);
    page.drawText(venueStr, {
      x: (width - venueWidth) / 2,
      y: y,
      size: 11,
      font: helvetica,
      color: grayText,
    });

    y -= 20;

    page.drawRectangle({
      x: margin,
      y: y,
      width: pageWidth,
      height: 1,
      color: lightGray,
    });

    y -= 50;

    const labelX = margin;
    const valueX = margin + 80;

    page.drawText('Kategori:', {
      x: labelX,
      y: y,
      size: 11,
      font: helvetica,
      color: grayText,
    });
    page.drawText(ticket.category.name, {
      x: valueX,
      y: y,
      size: 11,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    y -= 25;

    page.drawText('Pemegang:', {
      x: labelX,
      y: y,
      size: 11,
      font: helvetica,
      color: grayText,
    });
    page.drawText(ticket.holderName, {
      x: valueX,
      y: y,
      size: 11,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    y -= 25;

    page.drawText('Order ID:', {
      x: labelX,
      y: y,
      size: 11,
      font: helvetica,
      color: grayText,
    });
    page.drawText(ticket.orderId, {
      x: valueX,
      y: y,
      size: 11,
      font: helvetica,
      color: rgb(0, 0, 0),
    });

    y -= 25;

    page.drawText('Ticket ID:', {
      x: labelX,
      y: y,
      size: 11,
      font: helvetica,
      color: grayText,
    });
    page.drawText(ticket.id, {
      x: valueX,
      y: y,
      size: 11,
      font: helvetica,
      color: rgb(0, 0, 0),
    });

    if (ticket.isInternal) {
      y -= 35;

      page.drawRectangle({
        x: labelX,
        y: y - 5,
        width: 100,
        height: 20,
        color: amber,
      });
      page.drawText('COMPLIMENTARY', {
        x: labelX + 10,
        y: y,
        size: 10,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
    }

    y -= 100;

    page.drawRectangle({
      x: margin,
      y: y,
      width: pageWidth,
      height: 1,
      color: lightGray,
    });

    y -= 80;

    const qrImage = await pdfDoc.embedPng(qrImageBuffer);
    const qrScale = 150 / qrImage.width;
    const qrScaledWidth = 150;
    const qrScaledHeight = qrImage.height * qrScale;

    page.drawImage(qrImage, {
      x: width - margin - qrScaledWidth,
      y: y - qrScaledHeight + 50,
      width: qrScaledWidth,
      height: qrScaledHeight,
    });

    const instruction =
      'Tunjukkan tiket ini kepada petugas\ndi pintu masuk';
    const lines = instruction.split('\n');
    let instructionY = y + 30;
    for (const line of lines) {
      page.drawText(line, {
        x: margin,
        y: instructionY,
        size: 11,
        font: helvetica,
        color: grayText,
      });
      instructionY -= 16;
    }

    page.drawRectangle({
      x: margin,
      y: margin + 20,
      width: pageWidth,
      height: 1,
      color: lightGray,
    });

    const footerText = 'Tiket ini hanya untuk 1 orang. Jangan bagikan QR code kepada orang lain.';
    const footerWidth = helvetica.widthOfTextAtSize(footerText, 8);
    page.drawText(footerText, {
      x: (width - footerWidth) / 2,
      y: margin + 35,
      size: 8,
      font: helvetica,
      color: grayText,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}