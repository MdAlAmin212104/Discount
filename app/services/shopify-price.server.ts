import { LogEvent } from "@prisma/client";
import prisma from "../db.server";

export interface ResolvedVariant {
  variantId: string;
  price: number;
  compareAtPrice: number | null;
  productId: string;
  productTitle: string;
  productHandle: string;
  productImage: string;
}

// Helper to clean GID (e.g. gid://shopify/Product/1234 -> 1234)
export function cleanGid(gid: string): string {
  return gid.split("/").pop() || gid;
}

// Fetch all variants targetted by a campaign's targets
export async function fetchVariantsForTargets(
  admin: any,
  targets: { targetType: string; targetValue: string }[]
): Promise<ResolvedVariant[]> {
  const resolvedVariants: Map<string, ResolvedVariant> = new Map();

  for (const target of targets) {
    try {
      if (target.targetType === "PRODUCT") {
        // targetValue is the Product GID (or comma-separated GIDs)
        const productIds = target.targetValue.split(",");
        for (const id of productIds) {
          if (!id.trim()) continue;
          const cleanId = id.trim().startsWith("gid://") ? id.trim() : `gid://shopify/Product/${id.trim()}`;
          const response = await admin.graphql(
            `#graphql
            query getProductVariants($id: ID!) {
              product(id: $id) {
                id
                title
                handle
                featuredImage {
                  url
                }
                variants(first: 100) {
                  nodes {
                    id
                    price
                    compareAtPrice
                  }
                }
              }
            }`,
            { variables: { id: cleanId } }
          );
          const resJson = await response.json();
          const product = resJson.data?.product;
          if (product && product.variants?.nodes) {
            for (const variant of product.variants.nodes) {
              resolvedVariants.set(variant.id, {
                variantId: variant.id,
                price: parseFloat(variant.price || "0"),
                compareAtPrice: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
                productId: product.id,
                productTitle: product.title,
                productHandle: product.handle,
                productImage: product.featuredImage?.url || "",
              });
            }
          }
        }
      } else if (target.targetType === "COLLECTION") {
        // targetValue is Collection GID (or comma separated)
        const collectionIds = target.targetValue.split(",");
        for (const id of collectionIds) {
          if (!id.trim()) continue;
          const cleanId = id.trim().startsWith("gid://") ? id.trim() : `gid://shopify/Collection/${id.trim()}`;
          const response = await admin.graphql(
            `#graphql
            query getCollectionProducts($id: ID!) {
              collection(id: $id) {
                products(first: 100) {
                  nodes {
                    id
                    title
                    handle
                    featuredImage {
                      url
                    }
                    variants(first: 100) {
                      nodes {
                        id
                        price
                        compareAtPrice
                      }
                    }
                  }
                }
              }
            }`,
            { variables: { id: cleanId } }
          );
          const resJson = await response.json();
          const products = resJson.data?.collection?.products?.nodes || [];
          for (const product of products) {
            if (product.variants?.nodes) {
              for (const variant of product.variants.nodes) {
                resolvedVariants.set(variant.id, {
                  variantId: variant.id,
                  price: parseFloat(variant.price || "0"),
                  compareAtPrice: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
                  productId: product.id,
                  productTitle: product.title,
                  productHandle: product.handle,
                  productImage: product.featuredImage?.url || "",
                });
              }
            }
          }
        }
      } else if (target.targetType === "TAG") {
        // targetValue is Tag name (or comma-separated tags)
        const tags = target.targetValue.split(",");
        for (const tag of tags) {
          if (!tag.trim()) continue;
          const query = `tag:${tag.trim()}`;
          const response = await admin.graphql(
            `#graphql
            query getProductsByTag($query: String!) {
              products(first: 100, query: $query) {
                nodes {
                  id
                  title
                  handle
                  featuredImage {
                    url
                  }
                  variants(first: 100) {
                    nodes {
                      id
                      price
                      compareAtPrice
                    }
                  }
                }
              }
            }`,
            { variables: { query } }
          );
          const resJson = await response.json();
          const products = resJson.data?.products?.nodes || [];
          for (const product of products) {
            if (product.variants?.nodes) {
              for (const variant of product.variants.nodes) {
                resolvedVariants.set(variant.id, {
                  variantId: variant.id,
                  price: parseFloat(variant.price || "0"),
                  compareAtPrice: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
                  productId: product.id,
                  productTitle: product.title,
                  productHandle: product.handle,
                  productImage: product.featuredImage?.url || "",
                });
              }
            }
          }
        }
      } else if (target.targetType === "VARIANT") {
        // targetValue is variant GID (or comma-separated variant GIDs)
        const variantIds = target.targetValue.split(",");
        for (const id of variantIds) {
          if (!id.trim()) continue;
          const cleanId = id.trim().startsWith("gid://") ? id.trim() : `gid://shopify/ProductVariant/${id.trim()}`;
          const response = await admin.graphql(
            `#graphql
            query getVariantDetails($id: ID!) {
              productVariant(id: $id) {
                id
                price
                compareAtPrice
                product {
                  id
                  title
                  handle
                  featuredImage {
                    url
                  }
                }
              }
            }`,
            { variables: { id: cleanId } }
          );
          const resJson = await response.json();
          const variant = resJson.data?.productVariant;
          if (variant) {
            resolvedVariants.set(variant.id, {
              variantId: variant.id,
              price: parseFloat(variant.price || "0"),
              compareAtPrice: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
              productId: variant.product.id,
              productTitle: variant.product.title,
              productHandle: variant.product.handle,
              productImage: variant.product.featuredImage?.url || "",
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching variants for target type ${target.targetType}:`, error);
    }
  }

  return Array.from(resolvedVariants.values());
}

// Update a variant's price on Shopify with retry on 429
export async function updateVariantPriceWithRetry(
  admin: any,
  variantId: string,
  newPrice: number,
  compareAtPrice: number | null,
  retries = 3
): Promise<any> {
  const formattedPrice = newPrice.toFixed(2);
  const formattedCompare = compareAtPrice ? compareAtPrice.toFixed(2) : null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // 1. Fetch the product ID associated with this variant ID
      const queryResponse = await admin.graphql(
        `#graphql
        query getVariantProduct($id: ID!) {
          productVariant(id: $id) {
            product {
              id
            }
          }
        }`,
        { variables: { id: variantId } }
      );

      if (queryResponse.status === 429) {
        if (attempt < retries) {
          console.warn(`Rate limit hit (429) on query. Retrying variant update in 2 seconds... (Attempt ${attempt}/${retries})`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        } else {
          throw new Error("Rate limit hit (429) and max retries exceeded");
        }
      }

      const queryJson = await queryResponse.json();
      const productId = queryJson.data?.productVariant?.product?.id;
      if (!productId) {
        throw new Error(`Product not found for variant ID: ${variantId}`);
      }

      // 2. Perform the update using productVariantsBulkUpdate
      const response = await admin.graphql(
        `#graphql
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants {
              id
              price
              compareAtPrice
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            productId,
            variants: [
              {
                id: variantId,
                price: formattedPrice,
                compareAtPrice: formattedCompare,
              },
            ],
          },
        }
      );

      // Handle HTTP status code checks (like 429 Rate Limit)
      if (response.status === 429) {
        if (attempt < retries) {
          console.warn(`Rate limit hit (429) on mutation. Retrying variant update in 2 seconds... (Attempt ${attempt}/${retries})`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        } else {
          throw new Error("Rate limit hit (429) and max retries exceeded");
        }
      }

      const resJson = await response.json();
      const errors = resJson.errors || [];
      const userErrors = resJson.data?.productVariantsBulkUpdate?.userErrors || [];

      if (errors.length > 0) {
        throw new Error(errors.map((e: any) => e.message).join(", "));
      }
      if (userErrors.length > 0) {
        throw new Error(userErrors.map((e: any) => `${e.field}: ${e.message}`).join(", "));
      }

      return resJson.data?.productVariantsBulkUpdate?.productVariants?.[0];
    } catch (err: any) {
      if (attempt < retries) {
        console.warn(`Error updating variant price: ${err.message}. Retrying in 2 seconds... (Attempt ${attempt}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        throw err;
      }
    }
  }
}
