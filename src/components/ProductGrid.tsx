import { useState } from "react";
import { menuData } from "@/data/menuData";
import { SelectedProduct } from "@/pages/Index";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type ProductGridProps = {
  onProductSelect: (product: SelectedProduct) => void;
  selectedProduct: SelectedProduct | null;
  selectedStore: string;
};

export default function ProductGrid({ onProductSelect, selectedProduct, selectedStore }: ProductGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  // Helper function để tạo unique product ID
  const generateProductId = (storeName: string, categoryTitle: string, productName: string) => {
    // Tạo ID từ tên store, category và product
    const combined = `${storeName}-${categoryTitle}-${productName}`;
    // Convert sang lowercase, remove special chars, replace spaces with dashes
    return combined
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove diacritics
      .replace(/[^a-z0-9\s-]/g, "") // Remove special chars except spaces and dashes
      .replace(/\s+/g, "-") // Replace spaces with dashes
      .replace(/-+/g, "-") // Replace multiple dashes with single dash
      .substring(0, 100); // Limit length
  };

  // Lấy sản phẩm theo quán đã chọn, hoặc tất cả nếu chưa chọn
  const allProducts = menuData
    .filter(store => !selectedStore || store.name === selectedStore)
    .flatMap(store => 
      store.items.flatMap(category => 
        category.items.map(item => ({
          productId: generateProductId(store.name, category.title, item.name),
          storeName: store.name,
          categoryTitle: category.title,
          productName: item.name,
          productPrice: item.price,
          productImage: item.imgUrl
        }))
      )
    );

  // Filter sản phẩm theo từ khóa tìm kiếm
  const filteredProducts = allProducts.filter(product => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    const productName = product.productName.toLowerCase();
    const categoryName = product.categoryTitle.toLowerCase();
    
    return productName.includes(query) || categoryName.includes(query);
  });

  const handleProductClick = (product: SelectedProduct) => {
    onProductSelect(product);
  };

  const isSelected = (product: SelectedProduct) => {
    return selectedProduct?.productId === product.productId;
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 pb-8">
      <h2 className="text-lg font-semibold text-foreground mb-4 text-center">
        {selectedStore ? `Món ${selectedStore}` : 'Chọn quán để xem món'}
      </h2>
      
      {/* Ô tìm kiếm */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Tìm kiếm món..." 
            className="pl-10 h-12 bg-card border-border rounded-2xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {searchQuery && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Tìm thấy {filteredProducts.length} món
          </p>
        )}
      </div>

      {allProducts.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {selectedStore ? 'Quán này chưa có món nào' : 'Vui lòng chọn quán để xem menu'}
        </p>
      ) : filteredProducts.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Không tìm thấy món nào với từ khóa "{searchQuery}"
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
        {filteredProducts.map((product, index) => (
          <div 
            key={index}
            onClick={() => handleProductClick(product)}
            className={`bg-card rounded-2xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer relative ${
              isSelected(product) ? 'ring-2 ring-primary ring-offset-2' : ''
            }`}
          >
            {/* Checkmark khi được chọn */}
            {isSelected(product) && (
              <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                <Check className="h-3 w-3" />
              </div>
            )}
            
            {/* Avatar/Image */}
            <div className="aspect-square mb-2 overflow-hidden rounded-xl bg-muted">
              <img 
                src={product.productImage} 
                alt={product.productName}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            
            {/* Tên món */}
            <p className="text-xs text-center font-medium text-foreground mb-1 line-clamp-2 min-h-[2rem]">
              {product.productName}
            </p>
            
            {/* Giá */}
            <p className="text-xs text-center font-semibold text-primary">
              {product.productPrice}
            </p>
          </div>
        ))}
        </div>
      )}
    </div>
  );
}
