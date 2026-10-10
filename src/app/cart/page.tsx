import type { Metadata } from 'next';
import Header from '@/components/Header';
import CartApp from '@/components/CartApp';

export const metadata: Metadata = { title: 'سلّتي | غراس المعلم' };

export default function CartPage() {
  return (
    <main>
      <Header crumbs={[{ label: 'السلة' }]} />
      <CartApp />
    </main>
  );
}
