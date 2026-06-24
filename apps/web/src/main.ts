// Vanilla "print the API" page: every action fetches the real API and dumps the
// JSON response into <pre>. No framework — the AWS plumbing is the point.
import {
  getApiBase,
  setApiBase,
  getToken,
  setToken,
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
} from "./api";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const out = $<HTMLPreElement>("out");
const idInput = $<HTMLInputElement>("orderId");
const baseInput = $<HTMLInputElement>("apiBase");
const tokenInput = $<HTMLInputElement>("jwt");

function print(label: string, value: unknown): void {
  out.textContent = `// ${label}\n${JSON.stringify(value, null, 2)}`;
}

async function run(label: string, fn: () => Promise<unknown>): Promise<void> {
  out.textContent = `// ${label} …`;
  try {
    print(label, await fn());
  } catch (err) {
    print(`${label} (request failed)`, { error: String(err) });
  }
}

function rememberId(value: unknown): void {
  const data = (value as { data?: { id?: string } } | null)?.data;
  if (data?.id) idInput.value = data.id;
}

baseInput.value = getApiBase();
baseInput.addEventListener("change", () => setApiBase(baseInput.value));

tokenInput.value = getToken();
tokenInput.addEventListener("change", () => setToken(tokenInput.value));

$("btnList").addEventListener("click", () => run("GET /orders", () => listOrders()));

$("btnCreate").addEventListener("click", () =>
  run("POST /orders", async () => {
    const res = await createOrder({
      items: [
        { sku: "SKU-1", qty: 2, price: 9.99 },
        { sku: "SKU-2", qty: 1, price: 4.5 },
      ],
    });
    rememberId(res);
    return res;
  }),
);

$("btnGet").addEventListener("click", () =>
  run(`GET /orders/${idInput.value}`, () => getOrder(idInput.value)),
);

$("btnUpdate").addEventListener("click", () =>
  run(`PATCH /orders/${idInput.value}`, () =>
    updateOrder(idInput.value, { status: "PAID" }),
  ),
);

$("btnDelete").addEventListener("click", () =>
  run(`DELETE /orders/${idInput.value}`, () => deleteOrder(idInput.value)),
);
