package com.overgain.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(WorkoutNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
