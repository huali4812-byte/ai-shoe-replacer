# Photoshop 2024 API Demo 0.2.0

CEP manifest targets Photoshop 25.x (Photoshop 2024).
Install the cep folder in your CEP/extensions directory and restart Photoshop.

The plugin reads ~/.kaienapi/config.json on each request. The configuration and
API key are not included in the distribution. It uses base_url, api_key and model.
The configured gpt-sol model is submitted to /v1/images/edits with multipart
image[] inputs, following the handoff script's OpenAI Images request format.
This provider/model combination has not yet produced a verified image.

Use the API test button to check connectivity. Choose target shoe PNG/JPEG
references and enter the exact replacement requirements, then generate.
The active document is duplicated and exported as a full-canvas PNG without
cropping or resizing. The request includes that PNG followed by the references.
Successful results are saved under ~/Pictures/AI-Shoe-Results and opened as a
new Photoshop document for human inspection. The original PSB is not saved or
overwritten. Requests time out after three minutes, with no automatic retry.

This is a manual-reference API integration, not a completed automatic Excel/Eagle
batch pipeline. The legacy placeholder execution button is hidden because its
host implementation is missing. API connectivity does not establish model
availability, image-edit support, pixel dimensions, or product accuracy.
