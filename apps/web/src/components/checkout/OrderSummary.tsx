interface TicketCategory {
  id: string;
  name: string;
  price: number;
  available: number;
  maxPerOrder: number;
  status: string;
}

interface Event {
  id: string;
  title: string;
  slug: string;
  startDate: string;
  venue?: { name: string };
}

interface OrderSummaryProps {
  event?: Event;
  selectedItems: { categoryId: string; qty: number }[];
  categories: TicketCategory[];
  buyerData: { name: string; email: string; phone: string };
  attendees: string[];
  paymentMethod: string;
}

export default function OrderSummary({
  event,
  selectedItems,
  categories,
  buyerData,
  attendees,
  paymentMethod,
}: OrderSummaryProps) {
  const total = selectedItems.reduce((sum, item) => {
    const category = categories.find((c) => c.id === item.categoryId);
    return sum + (category ? category.price * item.qty : 0);
  }, 0);

  return (
    <div>
      <h2>Order Summary</h2>
      {event && <p>Event: {event.title}</p>}
      <p>Buyer: {buyerData.name}</p>
      <p>Total: ${total}</p>
      <p>Payment: {paymentMethod}</p>
      <p>Attendees: {attendees.join(', ')}</p>
    </div>
  );
}