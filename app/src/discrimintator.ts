import * as crypto from "crypto";

(async () => {
  const event_name = "CreateEvent";
  const discriminator_name = `anchor:event`;

  const discriminator = crypto
    .createHash("sha256")
    .update(discriminator_name)
    .digest();

  console.log(Uint8Array.from(discriminator));
})();
