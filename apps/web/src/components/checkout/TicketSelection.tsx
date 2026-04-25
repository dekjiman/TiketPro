import { Button } from '@/components/ui/button';

interface TicketCategory {
  id: string;
  name: string;
  price: number;
  available: number;
  maxPerOrder: number;
  status: string;
}

interface TicketSelectionProps {
  categories: TicketCategory[];
  selectedItems: { categoryId: string; qty: number }[];
  onSelectionChange: (items: { categoryId: string; qty: number }[]) => void;
}

export default function TicketSelection({ categories, selectedItems, onSelectionChange }: TicketSelectionProps) {
  return (
    <div>
      <h2>Ticket Selection</h2>
      {categories.map((category) => (
        <div key={category.id}>
          <p>{category.name} - ${category.price}</p>
          <Button onClick={() => onSelectionChange([...selectedItems, { categoryId: category.id, qty: 1 }])}>
            Select
          </Button>
        </div>
      ))}
    </div>
  );
}