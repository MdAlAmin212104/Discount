import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

export async function getOrCreateShop(domain: string, accessToken: string) {
  let shop = await prisma.shop.findUnique({
    where: { domain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        domain,
        accessToken,
      },
    });
  } else if (shop.accessToken !== accessToken) {
    shop = await prisma.shop.update({
      where: { id: shop.id },
      data: { accessToken },
    });
  }

  // Ensure default theme settings exist
  const themeSettings = await prisma.themeSettings.findUnique({
    where: { shopId: shop.id },
  });

  if (!themeSettings) {
    await prisma.themeSettings.create({
      data: {
        shopId: shop.id,
      },
    });
  }

  return shop;
}

