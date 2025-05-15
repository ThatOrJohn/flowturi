# Demo Mode

Demo Mode is a feature that allows users to easily load test data files into Flowturi's Historical mode.

## Enabling Demo Mode

Demo Mode is controlled by the `VITE_DEMO_MODE` environment variable. By default, it's set to `false`.

To enable Demo Mode, you can:

1. Create a `.env` file in the project root with:

   ```
   VITE_DEMO_MODE=true
   ```

2. Or set the environment variable when starting the development server:

   ```
   VITE_DEMO_MODE=true npm run dev
   ```

3. Or modify the default value in `vite.config.js`:
   ```javascript
   define: {
     'import.meta.env.VITE_DEMO_MODE': JSON.stringify("true"), // Change to "true" to enable
   },
   ```

## Disabling Demo Mode

To disable Demo Mode (the default):

1. Make sure the environment variable is not set or set to `false`:

   ```
   VITE_DEMO_MODE=false npm run dev
   ```

2. Or ensure the value in `vite.config.js` is set to "false":
   ```javascript
   define: {
     'import.meta.env.VITE_DEMO_MODE': JSON.stringify("false"),
   },
   ```

## Using Demo Mode

When Demo Mode is enabled:

1. Open Flowturi in Historical mode
2. A "Demo Data" section will appear below the file upload area
3. Click on any of the sample data files to load them into the application

## Available Test Data Files

The following sample data files are included:

- `cloud-compute-burst.json`: Example of a cloud infrastructure with compute burst events
- `oil-refinery-flow.csv`: Sample data showing flows through an oil refinery process
- `fanout-fanin-test.csv`: Test data demonstrating fan-out and fan-in network patterns

## Adding New Test Data

To add more test data files:

1. Place your JSON or CSV file in the `public/test-data/` directory
2. Update the `TEST_DATA_FILES` array in `src/App.tsx` to include your new file

## Troubleshooting

If Demo Mode is not appearing even when enabled:

1. Make sure you're in Historical mode (not Real-time mode)
2. Check that your `.env` file is in the project root directory
3. Restart the development server after changing environment variables
4. Verify that the test data files exist in the `public/test-data/` directory
