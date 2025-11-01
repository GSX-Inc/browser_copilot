
Here is the exact JSON configuration to use. Copy the content below and paste it into the file located at:
`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.my_app.cdp_host.json`

Make sure to completely replace the existing content of the file with this new configuration.

```json
{
  "name": "com.my_app.cdp_host",
  "description": "Host for executing CDP commands for the AI Co-pilot",
  "path": "/Users/decillionaire/Downloads/browser_copilot/native-host/host-app.js",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://emmbndflhdkdnnepfkgijdggafabdhhn/"
  ]
}
```

After saving the file, restart Google Chrome for the changes to take effect.
