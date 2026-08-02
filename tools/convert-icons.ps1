Add-Type -AssemblyName System.Drawing
$files = @("icon.png", "splash-icon.png", "android-icon-foreground.png", "favicon.png")
foreach ($f in $files) {
    $path = "C:\Users\tudor\OneDrive\Desktop\AplicatieNutritie\frontend-nutritie\assets\images\$f"
    if (Test-Path $path) {
        $img = [System.Drawing.Image]::FromFile($path)
        $tmp = "$path.tmp.png"
        $img.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
        $img.Dispose()
        Move-Item -Force $tmp $path
        Write-Host "Converted to true PNG: $f"
    }
}
