import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@goboda/ui",
    "@goboda/i18n",
    "@goboda/shared-types",
    "@goboda/db",
  ],
};

export default withNextIntl(nextConfig);
