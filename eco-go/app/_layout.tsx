import { Stack } from "expo-router";

export default function RootLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen
                name="compare"
                options={{
                    presentation: "modal",
                    animation: "slide_from_bottom",
                }}
            />
        </Stack>
    );
}