export function buildOpenApiSpec(baseUrl: string) {
  const adminSecurity = [{ bearerAuth: [] }];
  const userSecurity = [{ bearerAuth: [] }];
  const loginRequestBody = {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "admin@looksmax.com",
            },
            password: {
              type: "string",
              example: "TempAdmin2026",
            },
          },
        },
      },
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Looksmaxtn Backend API",
      version: "1.0.0",
      description:
        "Shared backend for the Looksmaxtn storefront and admin applications.",
    },
    servers: [
      {
        url: baseUrl,
        description: "Current backend server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    tags: [
      { name: "Admin Auth" },
      { name: "Admin Catalog" },
      { name: "Admin Content" },
      { name: "Admin Operations" },
      { name: "Store Auth" },
      { name: "Store Catalog" },
      { name: "Store Orders" },
      { name: "Store Account" },
      { name: "Store Studio" },
      { name: "Store Misc" },
    ],
    paths: {
      "/api/admin/auth/login": {
        post: {
          tags: ["Admin Auth"],
          summary: "Sign in as an admin user",
          requestBody: loginRequestBody,
          responses: {
            "200": { description: "Admin authenticated" },
            "400": { description: "Email/password missing or invalid JSON" },
            "401": { description: "Invalid credentials" },
            "403": { description: "Access denied. Admin only." },
          },
        },
      },
      "/api/admin/auth/logout": {
        post: {
          tags: ["Admin Auth"],
          summary: "Sign out the current admin session",
          security: adminSecurity,
          responses: {
            "200": { description: "Admin logged out" },
          },
        },
      },
      "/api/admin/auth/me": {
        get: {
          tags: ["Admin Auth"],
          summary: "Get the current admin session",
          security: adminSecurity,
          responses: {
            "200": { description: "Current admin session" },
            "403": { description: "Unauthorized" },
          },
        },
      },
      "/api/admin/products": {
        get: {
          tags: ["Admin Catalog"],
          summary: "List products for the admin dashboard",
          security: adminSecurity,
          responses: {
            "200": { description: "Products list" },
          },
        },
        post: {
          tags: ["Admin Catalog"],
          summary: "Create a product",
          security: adminSecurity,
          responses: {
            "200": { description: "Product created" },
          },
        },
      },
      "/api/admin/products/{id}": {
        get: {
          tags: ["Admin Catalog"],
          summary: "Get one product",
          security: adminSecurity,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Product detail" },
            "404": { description: "Not found" },
          },
        },
        put: {
          tags: ["Admin Catalog"],
          summary: "Update a product",
          security: adminSecurity,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Product updated" },
          },
        },
        delete: {
          tags: ["Admin Catalog"],
          summary: "Delete a product",
          security: adminSecurity,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Product deleted" },
          },
        },
      },
      "/api/admin/products/generate": {
        post: {
          tags: ["Admin Catalog"],
          summary: "Generate product images from model/product inputs",
          security: adminSecurity,
          responses: {
            "200": { description: "Generated images returned" },
          },
        },
      },
      "/api/admin/categories": {
        get: {
          tags: ["Admin Catalog"],
          summary: "List categories",
          security: adminSecurity,
          responses: {
            "200": { description: "Categories list" },
          },
        },
        post: {
          tags: ["Admin Catalog"],
          summary: "Create a category",
          security: adminSecurity,
          responses: {
            "200": { description: "Category created" },
          },
        },
      },
      "/api/admin/categories/{id}": {
        put: {
          tags: ["Admin Catalog"],
          summary: "Update a category",
          security: adminSecurity,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Category updated" },
          },
        },
        delete: {
          tags: ["Admin Catalog"],
          summary: "Delete a category",
          security: adminSecurity,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Category deleted" },
          },
        },
      },
      "/api/admin/homepage": {
        get: {
          tags: ["Admin Content"],
          summary: "Get homepage content for the admin editor",
          security: adminSecurity,
          responses: {
            "200": { description: "Homepage content" },
          },
        },
        put: {
          tags: ["Admin Content"],
          summary: "Update homepage content",
          security: adminSecurity,
          responses: {
            "200": { description: "Homepage updated" },
          },
        },
      },
      "/api/admin/models": {
        get: {
          tags: ["Admin Catalog"],
          summary: "List uploaded models",
          security: adminSecurity,
          responses: {
            "200": { description: "Models list" },
          },
        },
        post: {
          tags: ["Admin Catalog"],
          summary: "Create a model asset",
          security: adminSecurity,
          responses: {
            "200": { description: "Model created" },
          },
        },
      },
      "/api/admin/generated-images": {
        get: {
          tags: ["Admin Content"],
          summary: "List generated images",
          security: adminSecurity,
          responses: {
            "200": { description: "Generated images list" },
          },
        },
        post: {
          tags: ["Admin Content"],
          summary: "Generate images from prompt and source images",
          security: adminSecurity,
          responses: {
            "200": { description: "Generated image asset created" },
          },
        },
      },
      "/api/admin/orders": {
        get: {
          tags: ["Admin Operations"],
          summary: "List orders",
          security: adminSecurity,
          responses: {
            "200": { description: "Orders list" },
          },
        },
      },
      "/api/admin/orders/{id}": {
        get: {
          tags: ["Admin Operations"],
          summary: "Get one order",
          security: adminSecurity,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Order detail" },
          },
        },
        put: {
          tags: ["Admin Operations"],
          summary: "Update order status",
          security: adminSecurity,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Order updated" },
          },
        },
      },
      "/api/admin/users": {
        get: {
          tags: ["Admin Operations"],
          summary: "List users",
          security: adminSecurity,
          responses: {
            "200": { description: "Users list" },
          },
        },
      },
      "/api/admin/users/me/store-credits": {
        get: {
          tags: ["Admin Operations"],
          summary: "Get the current store owner's generation credits",
          security: adminSecurity,
          responses: {
            "200": {
              description: "Credit balance",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      allowed: { type: "integer", example: 50 },
                      used: { type: "integer", example: 12 },
                      remaining: { type: "integer", example: 38 },
                    },
                  },
                },
              },
            },
            "401": { description: "Unauthorized" },
            "403": { description: "Caller is not a store owner" },
            "404": { description: "User not found" },
          },
        },
        post: {
          tags: ["Admin Operations"],
          summary: "Top up the current store owner's generation credits",
          security: adminSecurity,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount", "code"],
                  properties: {
                    amount: { type: "integer", minimum: 1, example: 10 },
                    code: { type: "string", description: "Top-up code provided out-of-band" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Updated credit balance",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      allowed: { type: "integer" },
                      used: { type: "integer" },
                      remaining: { type: "integer" },
                    },
                  },
                },
              },
            },
            "400": { description: "Invalid amount" },
            "401": { description: "Unauthorized" },
            "403": { description: "Invalid code or caller is not a store owner" },
            "404": { description: "User not found" },
          },
        },
      },
      "/api/admin/stats": {
        get: {
          tags: ["Admin Operations"],
          summary: "Get admin dashboard stats",
          security: adminSecurity,
          responses: {
            "200": { description: "Dashboard stats" },
          },
        },
      },
      "/api/store/auth/signup": {
        post: {
          tags: ["Store Auth"],
          summary: "Create a storefront account",
          responses: {
            "200": { description: "Account created" },
          },
        },
      },
      "/api/store/auth/resend-verification": {
        post: {
          tags: ["Store Auth"],
          summary: "Resend the storefront verification email",
          responses: {
            "200": { description: "Verification email queued or sent" },
            "429": { description: "Cooldown not finished" },
          },
        },
      },
      "/api/store/auth/login": {
        post: {
          tags: ["Store Auth"],
          summary: "Sign in to the storefront",
          requestBody: loginRequestBody,
          responses: {
            "200": { description: "User authenticated" },
            "400": { description: "Email/password missing or invalid JSON" },
            "401": { description: "Invalid credentials" },
          },
        },
      },
      "/api/store/auth/forgot-password": {
        post: {
          tags: ["Store Auth"],
          summary: "Request a password reset email",
          responses: {
            "200": { description: "Password reset email sent or queued" },
            "429": { description: "Cooldown not finished" },
          },
        },
      },
      "/api/store/auth/reset-password": {
        post: {
          tags: ["Store Auth"],
          summary: "Complete a password reset",
          responses: {
            "200": { description: "Password updated" },
            "400": { description: "Invalid request" },
            "410": { description: "Reset link expired or invalid" },
          },
        },
      },
      "/api/store/auth/logout": {
        post: {
          tags: ["Store Auth"],
          summary: "Sign out of the storefront",
          responses: {
            "200": { description: "User logged out" },
          },
        },
      },
      "/api/store/auth/me": {
        get: {
          tags: ["Store Auth"],
          summary: "Get current storefront session",
          security: userSecurity,
          responses: {
            "200": { description: "Current storefront user" },
          },
        },
      },
      "/api/store/auth/verify-email": {
        post: {
          tags: ["Store Auth"],
          summary: "Verify a newly registered storefront email",
          responses: {
            "200": { description: "Email verified" },
            "400": { description: "Invalid verification link" },
            "410": { description: "Verification link expired" },
          },
        },
      },
      "/api/store/categories": {
        get: {
          tags: ["Store Catalog"],
          summary: "Get storefront category tree",
          responses: {
            "200": { description: "Category tree" },
          },
        },
      },
      "/api/store/products": {
        get: {
          tags: ["Store Catalog"],
          summary: "List storefront products",
          responses: {
            "200": { description: "Products list" },
          },
        },
      },
      "/api/store/products/{id}": {
        get: {
          tags: ["Store Catalog"],
          summary: "Get one storefront product",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Product detail" },
          },
        },
      },
      "/api/store/products/{id}/reserve": {
        post: {
          tags: ["Store Catalog"],
          summary: "Reserve a unique product",
          security: userSecurity,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Reservation created" },
          },
        },
        delete: {
          tags: ["Store Catalog"],
          summary: "Release a reservation",
          security: userSecurity,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Reservation released" },
          },
        },
      },
      "/api/store/cart/availability": {
        post: {
          tags: ["Store Catalog"],
          summary: "Check cart or try-on availability",
          responses: {
            "200": { description: "Availability status" },
          },
        },
      },
      "/api/store/orders": {
        get: {
          tags: ["Store Orders"],
          summary: "List current user orders",
          responses: {
            "200": { description: "Orders list" },
          },
        },
        post: {
          tags: ["Store Orders"],
          summary: "Create a new order",
          responses: {
            "200": { description: "Order created" },
          },
        },
      },
      "/api/store/orders/{id}": {
        get: {
          tags: ["Store Orders"],
          summary: "Get one order",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Order detail" },
          },
        },
      },
      "/api/store/users/me/address": {
        put: {
          tags: ["Store Account"],
          summary: "Update user billing address",
          responses: {
            "200": { description: "Address updated" },
          },
        },
      },
      "/api/store/users/me/password": {
        put: {
          tags: ["Store Account"],
          summary: "Update user password",
          responses: {
            "200": { description: "Password updated" },
          },
        },
      },
      "/api/store/users/me/body-profile": {
        put: {
          tags: ["Store Account"],
          summary: "Update outfit studio body profile",
          responses: {
            "200": { description: "Body profile updated" },
          },
        },
      },
      "/api/store/outfits": {
        get: {
          tags: ["Store Studio"],
          summary: "List saved outfits",
          responses: {
            "200": { description: "Saved outfits list" },
          },
        },
        post: {
          tags: ["Store Studio"],
          summary: "Save a generated outfit",
          responses: {
            "200": { description: "Outfit saved" },
          },
        },
      },
      "/api/store/outfits/{id}": {
        get: {
          tags: ["Store Studio"],
          summary: "Get one saved outfit",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Outfit detail" },
          },
        },
        put: {
          tags: ["Store Studio"],
          summary: "Update a saved outfit",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Outfit updated" },
          },
        },
        delete: {
          tags: ["Store Studio"],
          summary: "Delete a saved outfit",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Outfit deleted" },
          },
        },
      },
      "/api/store/outfits/{id}/share": {
        post: {
          tags: ["Store Studio"],
          summary: "Create or refresh a share link for an outfit",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Share link created" },
          },
        },
      },
      "/api/store/generate-outfit": {
        post: {
          tags: ["Store Studio"],
          summary: "Start an outfit generation job",
          responses: {
            "200": { description: "Generation job started" },
          },
        },
      },
      "/api/store/generate-outfit/{jobId}": {
        get: {
          tags: ["Store Studio"],
          summary: "Poll outfit generation status",
          parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Generation job state" },
          },
        },
      },
      "/api/store/generate-outfit/webhook": {
        post: {
          tags: ["Store Studio"],
          summary: "Receive outfit generation callback images",
          responses: {
            "200": { description: "Webhook accepted" },
          },
        },
      },
      "/api/store/homepage": {
        get: {
          tags: ["Store Misc"],
          summary: "Get storefront homepage content",
          responses: {
            "200": { description: "Homepage content" },
          },
        },
      },
      "/api/store/contact": {
        post: {
          tags: ["Store Misc"],
          summary: "Submit a contact message",
          responses: {
            "200": { description: "Message submitted" },
          },
        },
      },
      "/api/store/newsletter": {
        post: {
          tags: ["Store Misc"],
          summary: "Subscribe to newsletter",
          responses: {
            "200": { description: "Subscribed" },
          },
        },
        delete: {
          tags: ["Store Misc"],
          summary: "Unsubscribe from newsletter",
          responses: {
            "200": { description: "Unsubscribed" },
          },
        },
      },
    },
  };
}
