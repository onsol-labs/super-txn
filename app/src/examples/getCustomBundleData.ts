import { JitoHandler } from "../utils/jitoHandler";

async function main() {
  const jitoHandler = new JitoHandler({});
  const bundleId = "9f49cf5784be210dcd805383ca65a9a48469d109af3c9bad019ee5d9335193ab";
  const bundleData = await jitoHandler.getCustomBundleIdData(bundleId);
  console.log(bundleData);
}

main();