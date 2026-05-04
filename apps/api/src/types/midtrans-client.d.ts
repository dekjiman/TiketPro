declare module 'midtrans-client' {
  export namespace Midtrans {
    class Snap {
      constructor(config: { serverKey: string; clientKey: string; isProduction: boolean });
      createTransactionToken(params: {
        transaction_details: { order_id: string; gross_amount: number };
        customer_details: { first_name: string; email: string };
      }): string;
    }
  }
  export default Midtrans;
}
