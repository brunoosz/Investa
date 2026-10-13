package com.investa.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoiceInputPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(BackgroundPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStop() {
        super.onStop();
        AppIconPlugin.applyPending(getApplicationContext());
    }
}
