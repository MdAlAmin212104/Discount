import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import WhatsAppSupport from "../components/WhatsAppSupport";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { 
    apiKey: process.env.SHOPIFY_API_KEY || "",
    supportWhatsAppNumber: process.env.SUPPORT_WHATSAPP_NUMBER || "8801707691162",
  };
};

export default function App() {
  const { apiKey, supportWhatsAppNumber } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/campaigns">Campaigns</s-link>
        <s-link href="/app/theme-settings">Theme</s-link>
      </s-app-nav>

      <Outlet />
      
      <WhatsAppSupport phone={supportWhatsAppNumber} />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
