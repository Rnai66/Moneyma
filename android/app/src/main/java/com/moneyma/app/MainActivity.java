package com.moneyma.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Chrome DevTools inspection (chrome://inspect) for debug builds only.
        // This runs after super.onCreate(), so it overrides whatever Capacitor's
        // Bridge set from capacitor.config — this line is the real switch.
        // Release builds are never inspectable because of the BuildConfig.DEBUG gate.
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
    }
}
