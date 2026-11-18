param([ValidateSet("assessment","theory")][string]$Kind = "assessment", [int]$Limit = 0)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult,Windows.Media.Ocr,ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetGenericArguments().Count -eq 1 } | Select-Object -First 1
function Receive-Result($operation, $type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
    $task.GetAwaiter().GetResult()
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (!$engine) { throw 'No Windows OCR language available' }
$index = Get-Content -Raw extraction/inventory.json -Encoding UTF8 | ConvertFrom-Json
$entries = if ($Kind -eq 'assessment') { $index.screenshots } else {
    foreach ($prop in $index.theory.PSObject.Properties) {
        foreach ($path in $prop.Value) { @{ path=$path; id=$path } }
    }
}
$output = Join-Path (Get-Location) $(if ($Kind -eq "assessment") { "extraction/ocr/assessment-layout.jsonl" } else { "extraction/ocr/theory-ocr.jsonl" })
$finished = @{}
if (Test-Path -LiteralPath $output) {
    Get-Content -LiteralPath $output -Encoding UTF8 | ForEach-Object {
        try { $item = ConvertFrom-Json $_; if (!$item.error) { $finished[([string]$item.path).ToLower()] = $true } } catch {}
    }
}
$count = 0
$writer = [IO.StreamWriter]::new($output,$true,[Text.UTF8Encoding]::new($false))
$writer.AutoFlush = $true
try {
    foreach ($entry in $entries) {
        if ($finished.ContainsKey(([string]$entry.path).ToLower())) { continue }
        $stream = $null
        $bitmap = $null
        $item = @{ id=$entry.id; path=$entry.path }
        try {
            $file = Receive-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($entry.path)) ([Windows.Storage.StorageFile])
            $stream = Receive-Result ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
            $decoder = Receive-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
            $bitmap = Receive-Result ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
            $result = Receive-Result ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
            $item.lines = @($result.Lines | ForEach-Object { $_.Text })
            if ($Kind -eq "assessment") {
                $item.boxes = @($result.Lines | ForEach-Object {
                    ,@($_.Words | ForEach-Object {
                        $r = $_.BoundingRect
                        ,@([int]$r.X,[int]$r.Y,[int]$r.Width,[int]$r.Height,$_.Text)
                    })
                })
            }
        } catch { $item.error = $_.Exception.Message }
        finally { if ($bitmap) { $bitmap.Dispose() }; if ($stream) { $stream.Dispose() } }
        $writer.WriteLine(($item | ConvertTo-Json -Compress -Depth 4))
        $count++
        if ($count % 100 -eq 0) { Write-Output "$Kind processed $count" }
        if ($Limit -gt 0 -and $count -ge $Limit) { break }
    }
} finally { $writer.Dispose() }

