import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Heart, MessageSquare, User } from "lucide-react";
import { SelectedProduct } from "@/pages/Index";
import { Card } from "@/components/ui/card";
import allowedUsers from "@/data/allowedUsers.json";

const formSchema = z.object({
  customerName: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  selectedProduct: z.string().min(1, "Vui lòng chọn sản phẩm từ danh sách bên dưới!"),
});

type FormData = z.infer<typeof formSchema>;

type OrderFormProps = {
  selectedProduct: SelectedProduct | null;
};

export default function OrderForm({ selectedProduct }: OrderFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtherName, setIsOtherName] = useState(false);
  const [customName, setCustomName] = useState("");
  const [showWishDialog, setShowWishDialog] = useState(false);
  const [wishMessage, setWishMessage] = useState("");
  const [luckyNumber, setLuckyNumber] = useState<number | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: "",
      notes: "",
      selectedProduct: "",
    },
  });

  // Hàm lấy số may mắn còn trống từ database
  const getAvailableLuckyNumber = async (): Promise<number | null> => {
    try {
      // Query tất cả số đã được sử dụng
      const { data: usedNumbers, error } = await supabase
        .from("orders")
        .select("number")
        .not("number", "is", null);

      if (error) {
        console.error("Error fetching used numbers:", error);
        return null;
      }

      // Tạo set các số đã dùng
      const usedSet = new Set(usedNumbers?.map(order => order.number) || []);
      
      // Tìm các số chưa dùng từ 1-8
      const availableNumbers = [];
      for (let i = 1; i <= 8; i++) {
        if (!usedSet.has(i)) {
          availableNumbers.push(i);
        }
      }

      // Nếu không còn số nào, return null
      if (availableNumbers.length === 0) {
        return null;
      }

      // Random chọn 1 số từ các số còn lại
      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      return availableNumbers[randomIndex];
    } catch (error) {
      console.error("Error in getAvailableLuckyNumber:", error);
      return null;
    }
  };

  // Tự động cập nhật form khi selectedProduct thay đổi
  useEffect(() => {
    if (selectedProduct) {
      const productString = `${selectedProduct.storeName} > ${selectedProduct.categoryTitle} > ${selectedProduct.productName}`;
      form.setValue("selectedProduct", productString, { shouldValidate: true });
    }
  }, [selectedProduct, form]);

  const onSubmit = async (data: FormData) => {
    if (!selectedProduct) {
      toast.error("Vui lòng chọn sản phẩm từ danh sách bên dưới!");
      return;
    }

    // Nếu chọn "Khác" hoặc customerName là "__other__" thì dùng customName
    const finalName = (isOtherName || data.customerName === "__other__") 
      ? customName.trim() 
      : (data.customerName || "").trim();
    
    if (!finalName) {
      toast.error("Vui lòng nhập tên của bạn!");
      return;
    }

    setIsSubmitting(true);
    
    // Tìm user trong danh sách để kiểm tra giới tính
    const user = allowedUsers.find(u => u.name === finalName);
    
    try {
      // Kiểm tra xem người này đã order chưa
      const { data: existingOrder, error: queryError } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_name", finalName)
        .maybeSingle();

      if (queryError) {
        throw queryError;
      }

      // Nếu đã có order rồi → UPDATE
      if (existingOrder) {
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            notes: data.notes || null,
            selected_product: data.selectedProduct,
            product_id: selectedProduct.productId,
          })
          .eq("id", existingOrder.id);

        if (updateError) throw updateError;

        // Lấy số may mắn hiện tại của order này
        if (existingOrder.number) {
          setLuckyNumber(existingOrder.number);
        }

        if (user && user.gender === "Nữ" && user.wish) {
          setWishMessage(user.wish);
          setShowWishDialog(true);
        } else {
          toast.success("Đơn hàng của bạn đã được cập nhật thành công!");
        }

        form.reset();
        setIsOtherName(false);
        setCustomName("");
        setIsSubmitting(false);
        return;
      }

      // Chưa có order → Tạo mới với số may mắn (chỉ cho nữ)
      let generatedLuckyNumber: number | null = null;
      if (user && user.gender === "Nữ") {
        generatedLuckyNumber = await getAvailableLuckyNumber();
        
        if (generatedLuckyNumber === null) {
          setIsSubmitting(false);
          toast.error("Rất tiếc! Tất cả 8 số may mắn đã được sử dụng hết. Vui lòng liên hệ admin.");
          return;
        }
      }
      
      // Hàm thử submit với retry nếu bị duplicate
      const submitOrder = async (luckyNum: number | null, retryCount = 0): Promise<boolean> => {
        const { error } = await supabase.from("orders").insert({
          customer_name: finalName,
          shipping_address: null,
          phone_number: null,
          notes: data.notes || null,
          selected_product: data.selectedProduct,
          product_id: selectedProduct.productId,
          number: luckyNum,
        });

        if (error) {
          // Nếu bị lỗi duplicate key và còn cơ hội retry
          if (error.code === "23505" && retryCount < 3) {
            console.log(`Duplicate number ${luckyNum}, retrying... (${retryCount + 1}/3)`);
            
            // Lấy số mới
            const newNumber = await getAvailableLuckyNumber();
            if (newNumber === null) {
              toast.error("Rất tiếc! Tất cả số may mắn đã được sử dụng hết.");
              return false;
            }
            
            // Retry với số mới
            return await submitOrder(newNumber, retryCount + 1);
          }
          
          throw error;
        }

        // Thành công - lưu số may mắn để hiển thị
        if (luckyNum) {
          setLuckyNumber(luckyNum);
        }
        
        return true;
      };

      const success = await submitOrder(generatedLuckyNumber);
      
      if (!success) {
        setIsSubmitting(false);
        return;
      }
      
      if (user && user.gender === "Nữ" && user.wish) {
        // Nếu là nữ và có lời chúc, hiển thị dialog
        setWishMessage(user.wish);
        setShowWishDialog(true);
      } else {
        // Nếu là nam hoặc không có trong danh sách, chỉ hiện toast
        toast.success("Đơn hàng đã được gửi thành công!");
      }
      
      form.reset();
      setIsOtherName(false);
      setCustomName("");
    } catch (error) {
      console.error("Error submitting order:", error);
      toast.error("Có lỗi xảy ra. Vui lòng thử lại!");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto  space-y-4">
      {/* Hiển thị sản phẩm đã chọn */}
      {selectedProduct && (
        <div className="sticky top-0 p-4 z-50 bg-white">
          <Card className="p-4 bg-card border-2 border-primary ">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                <img 
                  src={selectedProduct.productImage} 
                  alt={selectedProduct.productName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{selectedProduct.storeName}</p>
                <p className="text-sm font-semibold text-foreground">{selectedProduct.productName}</p>
                <p className="text-sm font-bold text-primary">{selectedProduct.productPrice}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 px-4">
          <FormField
            control={form.control}
            name="customerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">Bạn là ai?</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    if (value === "__other__") {
                      setIsOtherName(true);
                      field.onChange("__other__");
                    } else {
                      setIsOtherName(false);
                      setCustomName("");
                      field.onChange(value);
                    }
                  }} 
                  value={field.value || ""}
                >
                  <FormControl>
                    <SelectTrigger className="h-12 bg-card border-border rounded-2xl">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <SelectValue placeholder="Chọn..." />
                      </div>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {allowedUsers.map((user) => (
                      <SelectItem key={user.name} value={user.name}>
                        {user.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__other__">Khác - Tôi không phải ai đó trong danh sách trên</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          {/* Input field khi chọn "Khác" */}
          {isOtherName && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nhập tên của bạn</label>
              <div className="relative">
                <Heart className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Nhập tên của bạn..." 
                  className="pl-10 h-12 bg-card border-border rounded-2xl"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </div>
            </div>
          )}

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">Ghi chú</FormLabel>
                <FormControl>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Textarea 
                      placeholder="eg. đường đá, size SML các thứ" 
                      className="pl-10 min-h-[80px] bg-card border-border rounded-2xl resize-none"
                      {...field} 
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button 
            type="submit" 
            disabled={isSubmitting || !selectedProduct}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-medium transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Đang gửi..." : "Đừng hối hận nhé, ko sửa được đơn đâu..."}
          </Button>
        </form>
      </Form>

      {/* Dialog chúc mừng 20-10 */}
      <AlertDialog open={showWishDialog} onOpenChange={setShowWishDialog}>
        <AlertDialogContent className="max-w-md border-4 border-pink-300 bg-gradient-to-br from-pink-50 via-white to-purple-50">
          <AlertDialogHeader>
            {/* Main flower bouquet */}
            <div className="flex justify-center mb-6">
              <div className="relative inline-block">
                {/* Main bouquet */}
                <div className="text-8xl animate-bounce">💐</div>
                
                {/* Surrounding flowers */}
                <div className="absolute -top-2 -left-2 text-3xl animate-spin" style={{ animationDuration: '3s' }}>🌸</div>
                <div className="absolute -top-2 -right-2 text-3xl animate-spin" style={{ animationDuration: '4s', animationDirection: 'reverse' }}>🌺</div>
                <div className="absolute -bottom-2 -left-3 text-3xl animate-bounce" style={{ animationDelay: '0.2s' }}>🌹</div>
                <div className="absolute -bottom-2 -right-3 text-3xl animate-bounce" style={{ animationDelay: '0.4s' }}>🌷</div>
                
                {/* Sparkles */}
                <div className="absolute -top-4 left-1/2 text-2xl animate-ping">✨</div>
                <div className="absolute -bottom-4 right-0 text-2xl animate-ping" style={{ animationDelay: '0.5s' }}>✨</div>
              </div>
            </div>

            <AlertDialogTitle className="text-center text-3xl font-bold bg-gradient-to-r from-pink-500 via-rose-500 to-purple-500 bg-clip-text text-transparent">
              Chúc mừng 20-10! 🎉
            </AlertDialogTitle>
            
            <AlertDialogDescription className="text-center text-base leading-relaxed pt-6 px-4 text-gray-700 font-medium">
              <span className="font-bold">BorderZ Việt Nam</span> {wishMessage}
            </AlertDialogDescription>

            {/* Số may mắn */}
            {luckyNumber && (
              <div className="mt-6 p-4 bg-gradient-to-r from-yellow-100 via-orange-100 to-red-100 rounded-xl border-2 border-orange-300 mx-4">
                <p className="text-center text-sm text-gray-600 font-medium mb-2">
                  🎁 Số may mắn của bạn 🎁
                </p>
                <p className="text-center text-6xl font-bold text-orange-600 tracking-widest animate-pulse">
                  {luckyNumber}
                </p>
                <p className="text-center text-xs text-gray-500 mt-2">
                  Hãy nhớ số này để nhận phần quà tương ứng!
                </p>
              </div>
            )}
          </AlertDialogHeader>
          
          <AlertDialogFooter className="mt-6">
            <AlertDialogAction 
              className="w-full h-12 bg-gradient-to-r from-pink-500 via-rose-500 to-purple-500 hover:from-pink-600 hover:via-rose-600 hover:to-purple-600 text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all"
              onClick={() => setShowWishDialog(false)}
            >
              Cảm ơn bạn! 💝
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
